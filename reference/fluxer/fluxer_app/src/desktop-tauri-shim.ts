// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Tauri-backed `window.electron` shim.
//
// The reference client detects "native desktop" via the presence of
// `window.electron` (an Electron preload bridge). This desktop build runs on
// Tauri instead, so we synthesize a compatible `window.electron` object backed
// by Tauri commands/plugins. Presence of this object makes `isDesktop()` true,
// which unlocks native behavior (native title bar + window controls, native
// notifications, autostart, global PTT/mute/deafen hotkeys, deep links) and
// disables the service worker (which conflicts with the Tauri custom protocol).
//
// Methods that map to a real Tauri capability are wired; the rest are safe
// stubs that resolve to inert defaults so the app degrades gracefully without
// throwing. This module must run before the app reads `window.electron`, so it
// is imported first from index.tsx.

import type {ElectronAPI, UpdaterEvent} from '@app/types/electron.d';
import {getRecordedCaptureSource, recordCaptureSource, startNativeDisplayCapture} from '@app/native-screenshare';
import {installVoiceDiagnosticsHotkey, VoiceDiagnostics} from '@app/features/voice/utils/VoiceDiagnostics';

type TauriGlobal = {
	core: {invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>};
	event: {
		listen: <T>(event: string, cb: (e: {payload: T}) => void) => Promise<() => void>;
		emit: (event: string, payload?: unknown) => Promise<void>;
	};
};

function getTauri(): TauriGlobal | null {
	const t = (window as unknown as {__TAURI__?: TauriGlobal}).__TAURI__;
	return t ?? null;
}

// Best-effort invoke that never rejects the caller for a missing command.
async function tryInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T | undefined> {
	const tauri = getTauri();
	if (!tauri) return undefined;
	try {
		return await tauri.core.invoke<T>(cmd, args);
	} catch (err) {
		console.warn(`[tauri-shim] invoke ${cmd} failed`, err);
		return undefined;
	}
}

// Subscribe to a Tauri event, returning an unsubscribe fn synchronously
// (the underlying listen is async; we buffer the unlisten).
function onEvent<T>(event: string, cb: (payload: T) => void): () => void {
	const tauri = getTauri();
	if (!tauri) return () => undefined;
	let unlisten: (() => void) | null = null;
	let disposed = false;
	void tauri.event
		.listen<T>(event, (e) => cb(e.payload))
		.then((fn) => {
			if (disposed) fn();
			else unlisten = fn;
		})
		.catch(() => undefined);
	return () => {
		disposed = true;
		unlisten?.();
	};
}

// --- updater bridge state -----------------------------------------------
// Shared between updaterCheck/Download/Install and onUpdaterEvent below.
const updaterListeners = new Set<(event: UpdaterEvent) => void>();
const updaterState: {
	rid: number | null;
	// bytesRid: the resource id `plugin:updater|download` returns for the
	// downloaded bytes — `plugin:updater|install` REQUIRES it (install takes
	// {updateRid, bytesRid}, not {rid}). Discarding it made install always
	// fail IPC arg deserialization → the update never applied.
	bytesRid: number | null;
	version: string | null;
	downloaded: boolean;
} = {
	rid: null,
	bytesRid: null,
	version: null,
	downloaded: false,
};

function emitUpdaterEvent(event: UpdaterEvent): void {
	for (const listener of [...updaterListeners]) {
		try {
			listener(event);
		} catch {
			/* a broken listener must not stop the others */
		}
	}
}

// Direct invoke that REJECTS on failure (unlike tryInvoke) — updater flows
// need to distinguish "no update" from "check failed" to show the right UI.
async function rawInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
	const tauri = getTauri();
	if (!tauri) throw new Error('tauri global unavailable');
	return await tauri.core.invoke<T>(cmd, args);
}

// tauri-plugin channels (streamed events from a plugin command) need the
// Channel class from the global API bundle; absent on very old runtimes, in
// which case download progress is simply not reported.
function newTauriChannel<T>(): {onmessage: (msg: T) => void} | null {
	const ChannelCtor = (window as unknown as {__TAURI__?: {core?: {Channel?: new () => {onmessage: (msg: T) => void}}}})
		.__TAURI__?.core?.Channel;
	return ChannelCtor ? new ChannelCtor() : null;
}

function detectPlatform(): 'darwin' | 'win32' | 'linux' {
	const ua = navigator.userAgent.toLowerCase();
	if (ua.includes('mac')) return 'darwin';
	if (ua.includes('linux') || ua.includes('android')) return 'linux';
	return 'win32';
}

const noop = (): void => undefined;
const noopUnsub = (): (() => void) => () => undefined;

// --- native screen-share publish state ----------------------------------
// The VoiceEngineV2 native path publishes a screen track in two steps that
// arrive on this shim separately (see DisplayMediaCapture.publishAndStartNative-
// Capture): first `voiceEngine.publishScreen({captureId, width, height, codec,
// maxBitrateBps, maxFramerate})` (NO source id), then
// `nativeScreenCapture.start({sourceId, sourceKind, captureId})` (HAS the
// source). The Rust command needs both halves, so publishScreen stashes its
// options keyed by captureId and nativeScreenCapture.start joins them with the
// source and fires the single `voice_engine_publish_screen` invoke. Keyed by
// captureId so a stale stash from an aborted publish can't leak into the next.
type PendingScreenPublish = {
	width: number;
	height: number;
	codec?: string;
	maxBitrateBps?: number;
	maxFramerate?: number;
};
const pendingScreenPublishByCaptureId = new Map<string, PendingScreenPublish>();

// Tracks whether the native camera is currently published, for isPublishingCamera.
let cameraPublishing = false;

// Cache the smart screen-codec pick for the session (GPU doesn't change).
let smartScreenCodecCache: string | null = null;

// Pick a screen-share codec when the user's setting is "automatic" and the
// client didn't resolve one. The native publish path SOFTWARE-encodes (no HW
// encoder is wired into voice-native yet), so the choice is a CPU-cost vs
// quality/compat trade — the sender's GPU only matters for HW encode, which we
// don't do, and the receiver's GPU matters for DECODE:
//   * vp9 — best quality-per-bit for screen content (text/UI), decodes on
//     essentially everything; moderate SW-encode cost. Best default.
//   * vp8 — cheapest SW encode + universal decode, but softer; fall back to it
//     on a weak CPU (few cores) so fps doesn't tank.
//   * av1 — best compression but SW-encode is very heavy → only when the CPU is
//     clearly strong (many cores) AND a capable GPU suggests the room can decode
//     it in hardware.
// TODO(hw-encode): once encoder-ring (NVENC/AMF/QSV) is wired into
// publish_screen, prefer AV1/H264 on the matching GPU vendor for near-free HW
// encode. Until then GPU vendor is advisory only.
async function pickSmartScreenCodec(): Promise<string> {
	if (smartScreenCodecCache) return smartScreenCodecCache;
	let codec = 'vp9';
	try {
		const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
		const gpu = await tryInvoke<{
			devices?: Array<{active?: boolean; vendorId?: number; vendor_id?: number; dedicatedVideoMemory?: number}>;
		}>('desktop_get_gpu_info');
		const dev = gpu?.devices?.find((d) => d.active) ?? gpu?.devices?.[0];
		const vendorId = dev?.vendorId ?? dev?.vendor_id ?? 0;
		const dedicatedVram = dev?.dedicatedVideoMemory ?? 0;
		// 0x10DE NVIDIA, 0x1002 AMD, 0x8086 Intel.
		const isNvidia = vendorId === 0x10de;
		const isAmd = vendorId === 0x1002;
		const isIntel = vendorId === 0x8086;
		const hasDiscreteGpu = (isNvidia || isAmd) && dedicatedVram > 1_000_000_000;
		// CRITICAL: hardware encoders (NVENC / VAAPI / AMF / VideoToolbox) accelerate
		// H264/H265/AV1 — NEVER VP8/VP9. So on any HW-encode-capable GPU, H264 is the
		// right pick: it's the ONE codec every HW encoder does, turning a CPU-bound
		// software screenshare into a near-free hardware one (with video_encoder=
		// Hardware set on the publish). Picking VP9 here would force software encode
		// even with a capable GPU sitting idle. Only fall back to VP9/VP8 software
		// when there's no HW encoder to use.
		if (isNvidia || isAmd || isIntel) {
			// Any modern discrete/integrated GPU HW-encodes H264 — universal, safe.
			codec = 'h264';
		} else if (cores <= 4) {
			// No HW encoder + weak CPU: cheapest software codec so fps holds.
			codec = 'vp8';
		} else {
			codec = 'vp9';
		}
		// (hasDiscreteGpu kept for a future AV1-HW tier — Ada/RDNA3/Arc do AV1 in
		// hardware, but this SDK's NVENC is H264/H265-only, so H264 is the safe win.)
		void hasDiscreteGpu;
	} catch {
		/* GPU probe failed — vp9 is a safe, high-quality default */
	}
	smartScreenCodecCache = codec;
	return codec;
}

function buildElectronShim(): ElectronAPI {
	const platform = detectPlatform();

	// Cast through unknown: we implement the real + commonly-called methods and
	// stub the rest. Optional members the app guards with `?.` may be omitted.
	const api = {
		platform,
		buildChannel: 'stable' as const,
		buildVariant: 'default' as const,

		// --- external links / downloads ---
		openExternal: async (url: string) => {
			await tryInvoke('plugin:opener|open_url', {url});
		},
		downloadFile: async (url: string, suggestedName: string) => {
			// Returns the client's DownloadResult shape: {success, canceled, path}.
			// The client checks `result.success` (NativeUtils.downloadWithNative) —
			// NOT `ok` — so the previous {ok,path} shape always read as failed even
			// when the download worked. A null path from Rust means the user
			// cancelled the save dialog (canceled:true, not a failure). rawInvoke so
			// a real command error rejects and the client can fall back, rather than
			// tryInvoke swallowing it into a silent no-op.
			try {
				const path = await rawInvoke<string | null>('desktop_download_file', {url, suggestedName});
				if (path == null) {
					return {success: false, canceled: true, path: undefined} as never;
				}
				return {success: true, canceled: false, path} as never;
			} catch (error) {
				return {success: false, canceled: false, error: String(error), path: undefined} as never;
			}
		},

		// --- native UI-sound playback ---
		// The webview audio path (HTML5 <audio> → WebAudio) is unreliable on
		// Linux/WebKitGTK ("The operation is not supported"); the Rust side
		// decodes+plays the notification sound via the OS audio stack. Sounds
		// are addressed by name (the client's SoundType) — the Rust command
		// owns the embedded ogg bytes. `nativeAudioAvailable` lets SoundUtils
		// decide whether to use this path (true only where the webview path is
		// known-bad, i.e. Linux) or fall back to its own <audio> element.
		nativeAudioAvailable: platform === 'linux',
		playSound: async (name: string, volume?: number) => {
			await tryInvoke('play_ui_sound', {name, volume});
		},

		// --- UI editor: run a sandboxed LuaU layout script (advanced mode) ---
		// The script runs in a locked-down Luau VM in Rust (no fs/net/process),
		// returning a batch of presentation ops the LayoutEngine applies. Returns
		// {ok, ops} on success or {ok:false, error} so the editor can show script
		// errors inline. rawInvoke (rejects) is wrapped so a Lua error surfaces as
		// a value rather than an unhandled rejection.
		uiEditorRunLua: async (script: string) => {
			try {
				const ops = await rawInvoke<unknown[]>('ui_editor_run_lua', {script});
				return {ok: true as const, ops};
			} catch (error) {
				return {ok: false as const, error: String(error)};
			}
		},

		// --- updater ---
		// Real auto-updates via tauri-plugin-updater, bridged to the client's
		// Electron-style updater API. Uses raw plugin invokes (no npm package —
		// withGlobalTauri exposes core.invoke + core.Channel). Updates are
		// fetched from the GitHub-releases-hosted latest.json configured in
		// tauri.conf.json's plugins.updater and applied as signed MSI (Windows,
		// passive install) / AppImage swap (Linux).
		onUpdaterEvent: (callback: (event: UpdaterEvent) => void) => {
			updaterListeners.add(callback);
			return () => updaterListeners.delete(callback);
		},
		updaterCheck: async (context: 'user' | 'background') => {
			emitUpdaterEvent({type: 'checking', context});
			try {
				const meta = await rawInvoke<{rid: number; version?: string | null} | null>('plugin:updater|check', {});
				if (meta && typeof meta.rid === 'number') {
					updaterState.rid = meta.rid;
					updaterState.bytesRid = null;
					updaterState.version = meta.version ?? null;
					updaterState.downloaded = false;
					// downloadStarted: false is REQUIRED — the client's Updater
					// state machine defaults a missing downloadStarted to `true`,
					// which flips it straight into a phantom "downloading 0%"
					// state and SKIPS the user confirm prompt. The plugin's
					// `check` only fetches metadata (it does NOT begin a
					// download), so false is also the truthful value; it routes
					// the client into nativeAwaitingDownload → confirm prompt.
					emitUpdaterEvent({
						type: 'available',
						context,
						version: updaterState.version,
						downloadStarted: false,
					});
				} else {
					updaterState.rid = null;
					emitUpdaterEvent({type: 'not-available', context});
				}
			} catch (err) {
				emitUpdaterEvent({type: 'error', context, message: String(err)});
			}
		},
		updaterDownload: async (context: 'user' | 'background') => {
			const rid = updaterState.rid;
			if (rid == null) {
				emitUpdaterEvent({type: 'error', context, message: 'no update available to download'});
				return;
			}
			try {
				const channel = newTauriChannel<{event: string; data?: {contentLength?: number; chunkLength?: number}}>();
				let transferred = 0;
				let total: number | null = null;
				// Rough download-rate estimate. The client's Updater DISCARDS any
				// progress event without a numeric bytesPerSecond, so this must
				// be present or the bar never moves off 0%.
				const startedAt = performance.now();
				const bytesPerSecond = (): number => {
					const secs = (performance.now() - startedAt) / 1000;
					return secs > 0 ? Math.round(transferred / secs) : 0;
				};
				if (channel) {
					channel.onmessage = (msg) => {
						if (msg.event === 'Started') {
							total = msg.data?.contentLength ?? null;
							emitUpdaterEvent({
								type: 'progress',
								context,
								percent: 0,
								transferred: 0,
								total: total ?? undefined,
								bytesPerSecond: 0,
								downloadStarted: true,
							});
						} else if (msg.event === 'Progress') {
							transferred += msg.data?.chunkLength ?? 0;
							emitUpdaterEvent({
								type: 'progress',
								context,
								percent: total ? Math.min(100, (transferred / total) * 100) : 0,
								transferred,
								total: total ?? undefined,
								bytesPerSecond: bytesPerSecond(),
							});
						}
					};
				}
				// `download` returns a NEW resource id for the downloaded bytes;
				// `install` REQUIRES it (as bytesRid). The channel arg key is
				// `onEvent` (Tauri auto-converts to the Rust `on_event` param).
				const bytesRid = await rawInvoke<number>(
					'plugin:updater|download',
					channel ? {rid, onEvent: channel} : {rid},
				);
				updaterState.bytesRid = typeof bytesRid === 'number' ? bytesRid : null;
				updaterState.downloaded = true;
				emitUpdaterEvent({type: 'downloaded', context, version: updaterState.version});
			} catch (err) {
				emitUpdaterEvent({type: 'error', context, message: String(err)});
			}
		},
		updaterInstall: async () => {
			const rid = updaterState.rid;
			if (rid == null) return;
			try {
				if (updaterState.downloaded && updaterState.bytesRid != null) {
					// install takes {updateRid, bytesRid} — NOT {rid}. Passing
					// the wrong keys made IPC arg deserialization fail, so the
					// update never applied.
					await rawInvoke('plugin:updater|install', {
						updateRid: rid,
						bytesRid: updaterState.bytesRid,
					});
				} else {
					// Not pre-downloaded: download_and_install does both in one
					// call. Its on_event channel arg is NOT optional, so a
					// channel must be passed even though we don't render its
					// progress here.
					const channel = newTauriChannel<{event: string; data?: unknown}>();
					await rawInvoke('plugin:updater|download_and_install', channel ? {rid, onEvent: channel} : {rid});
				}
				// Windows: the MSI installer exits + relaunches the app itself.
				// Linux: the updater only swaps the AppImage on disk — the
				// running process would keep serving the OLD version until
				// manually restarted, which reads as "the update didn't work".
				// Relaunch explicitly (Tauri re-execs the new AppImage).
				if (platform !== 'win32') {
					await tryInvoke('desktop_relaunch');
				}
			} catch (err) {
				emitUpdaterEvent({type: 'error', message: String(err)});
			}
		},

		// --- native screen share ---
		// Enumerate monitors + windows from the Rust backend so the reference's
		// OWN in-app ScreenSharePickerModal renders (native picker), instead of
		// the browser "Choose what to share" dialog.
		getDesktopSources: async (
			types: Array<'screen' | 'window'>,
			_requestId?: string,
			_options?: {listOnly?: boolean},
		) => {
			const sources = await tryInvoke<
				Array<{
					id: string;
					name: string;
					thumbnailDataUrl?: string;
					display_id?: string;
					nativeWidth?: number;
					nativeHeight?: number;
				}>
			>('desktop_get_sources', {types, listOnly: _options?.listOnly ?? false});
			return (sources ?? []) as never;
		},
		selectDisplayMediaSource: noop,
		// Native screen-capture bridge. Capture itself is performed by the
		// webview via getUserMedia({chromeMediaSource:'desktop'}) +
		// --auto-select-desktop-capture-source (see createChromiumPreviewBridge),
		// so `start` only reports metadata; there is no separate native frame
		// sink to manage.
		nativeScreenCapture: {
			getAvailability: async () => ({
				// MUST stay false: the reference picker reads this via
				// isNativeScreenCaptureAvailable() to route capture. true →
				// startConfiguredNativeDisplayScreenShare → assertNativeBridge-
				// Available() throws "Voice engine v2 native bridge is required
				// for desktop screen share capture" (this Tauri build ships no
				// window.electron.voiceEngine bridge) → clicking a source does
				// nothing, preview is black. false → startConfiguredDisplay-
				// ScreenShare (browser getDisplayMedia / LiveKit js path), which
				// needs no native bridge and works in WebView2.
				available: false,
				backend: 'chromium' as never,
				capabilities: {hidesCursor: false, screens: false, windows: false},
			}),
			listSources: async () => {
				const sources = await tryInvoke<
					Array<{id: string; name: string; nativeWidth?: number; nativeHeight?: number}>
				>('desktop_get_sources', {types: ['screen', 'window'], listOnly: true});
				return (sources ?? []).map((s) => ({
					kind: s.id.startsWith('screen:') ? 'screen' : 'window',
					id: s.id,
					name: s.name,
					width: s.nativeWidth ?? 0,
					height: s.nativeHeight ?? 0,
				})) as never;
			},
			start: async (options: {
				sourceId: string;
				sourceKind?: 'screen' | 'window' | 'game';
				width?: number;
				height?: number;
				frameRate?: number;
				captureId?: string;
			}) => {
				// Tell the backend which source the webview should auto-select for
				// the LOCAL self-preview getUserMedia (createScreenChromiumPreview-
				// Bridge). The PUBLISHED track, however, is fed by the native
				// ScreenCapture that voice_engine_publish_screen starts — so if this
				// start() belongs to a native-voice publish (has the stashed publish
				// options), fire that real publish here now that we know the source.
				await tryInvoke('desktop_select_capture_source', {sourceId: options.sourceId});
				// Record the picked source JS-side too, so the LOCAL self-preview's
				// getDisplayMedia override returns a NATIVE capture stream of this
				// exact source instead of falling through to WebView2's "Choose what
				// to share" dialog. Without this the user got a second picker on top
				// of the in-app one (the reported "asks permission instead of just
				// doing it"). Uses the SAME full 3-part id the native capture wants.
				{
					const previewKind =
						options.sourceKind ?? (options.sourceId.startsWith('window:') ? 'window' : 'screen');
					const previewId =
						options.sourceId.split(':').length >= 3
							? options.sourceId
							: `${previewKind}:${options.sourceId.replace(/^(?:screen|window):/, '')}:0`;
					recordCaptureSource(previewId);
				}
				const captureId = options.captureId ?? options.sourceId;
				const pending = pendingScreenPublishByCaptureId.get(captureId);
				if (pending) {
					pendingScreenPublishByCaptureId.delete(captureId);
					// sourceKind: prefer the caller's, else infer from the id prefix
					// (desktop source ids are `screen:…`/`window:…`).
					const sourceKind =
						options.sourceKind ?? (options.sourceId.startsWith('window:') ? 'window' : 'screen');
					// The V2 coordinator (parseDesktopCaptureSourceId) hands us the
					// BARE middle token (e.g. "0"), not the full `screen:0:0` the
					// native capture crate's parser requires — it splits the picker
					// id and keeps only parts[1]. Passing "0" yielded
					// "Invalid source: screen:0". Reconstruct the full 3-part id
					// (`<kind>:<token>:0`) when the sub-id form is missing. Idempotent:
					// an already-full `screen:0:0` (has two colons) is left as-is.
					const nativeSourceId =
						options.sourceId.split(':').length >= 3
							? options.sourceId
							: `${sourceKind}:${options.sourceId.replace(/^(?:screen|window):/, '')}:0`;
					const width = options.width ?? pending.width;
					const height = options.height ?? pending.height;
					await rawInvoke('voice_engine_publish_screen', {
						sourceId: nativeSourceId,
						sourceKind,
						width,
						height,
						fps: Math.round(options.frameRate ?? pending.maxFramerate ?? 30),
						maxBitrateBps: pending.maxBitrateBps,
						codec: pending.codec ?? '',
						// CRUCIAL: the V2 coordinator DROPS any published screen track
						// whose trackName !== the captureId (recordPublishedTrackSid in
						// VoiceEngineV2AppScreenShareCaptureCoordinator) as a "stale
						// publication for a different capture". The native track was
						// named "screen", so EVERY native publish was rejected → the
						// client fell back to the browser getDisplayMedia path (the
						// WebView2 dialog, the wrong/green capture, the uncapped live
						// preview). Pass the captureId so Rust names the track it and
						// the coordinator accepts the native publish.
						captureId,
					});
					return {
						captureId,
						width,
						height,
						frameRate: options.frameRate ?? pending.maxFramerate ?? 30,
						pixelFormat: 'nv12',
					} as never;
				}
				return {
					captureId,
					width: options.width ?? 0,
					height: options.height ?? 0,
					frameRate: options.frameRate ?? 60,
					pixelFormat: 'bgra',
				} as never;
			},
			stop: async (captureId?: string) => {
				// Symmetric with start(): tear down any native-voice publish tied
				// to this capture. (Belt-and-suspenders — unpublishScreen also does
				// this; stopNativeCaptureForEngine may call here too.)
				if (captureId) pendingScreenPublishByCaptureId.delete(captureId);
				// Clear the recorded self-preview source so a later plain
				// getDisplayMedia isn't hijacked into native capture of a stale one.
				recordCaptureSource(null);
				await tryInvoke('voice_engine_unpublish_screen');
				return undefined;
			},
			getDiagnostics: async () => null,
			// NOTE: onEnd / onLifecycleEvent are deliberately OMITTED. When they
			// exist, MediaEngineFacade.createSourceLifecycleBridge() spins up the
			// VoiceEngineV2 native SourceLifecycleBridge at boot, which asserts a
			// native frame-sink subscription contract we don't implement (capture
			// is via getUserMedia, not a native sink) — that assertion crashes the
			// whole app to a grey screen. With these absent, that code path is
			// skipped (`typeof api.onLifecycleEvent !== 'function'` → returns null)
			// while the native picker (getDesktopSources / getAvailability) still
			// works.
		} as never,

		// --- native voice engine (window.electron.voiceEngine) ---
		// Native LiveKit voice/audio via voice-native (Rust) + the
		// voice_engine_* Tauri commands, replacing the JS/LiveKit-in-webview
		// path that cannot work on Linux (WebKitGTK ships without WebRTC on
		// every mainstream distro — see native-voice-engine-scope memory
		// note). NativeVoiceEngineSelection.ts gates on ALL 41 methods in
		// VOICE_ENGINE_V2_BRIDGE_METHODS existing as functions before
		// switching over — a single missing method means full fallback to
		// the JS path, so P2/P3 methods not yet backed by real Rust work are
		// stubbed to reject rather than omitted.
		voiceEngine: {
			bridgeVersion: 18,

			// --- P1: implemented for real ---
			isSupported: async () => Boolean(await tryInvoke<boolean>('voice_engine_is_supported')),
			getCapabilities: async () => {
				const caps = await tryInvoke<Record<string, boolean>>('voice_engine_get_capabilities');
				return {
					microphoneCapture: false,
					syntheticMicrophonePcm: false,
					cameraCapture: false,
					nativeCameraBackgrounds: false,
					screenShare: false,
					screenShareEncodingUpdate: false,
					screenShareAudio: false,
					deviceLists: false,
					outputDeviceSelection: false,
					participantVolume: false,
					remoteTrackSubscription: false,
					// dataChannel + connectionStats are implemented natively
					// (voice_engine_publish_data / voice_engine_get_connection_stats),
					// so advertise them regardless of the Rust caps struct (which
					// doesn't carry these two fields).
					dataChannel: true,
					connectionStats: true,
					// Remote video (onVideoFrame) is implemented: Rust decodes each
					// remote video track to I420 and streams it to the webview.
					nativeVideoFrames: true,
					hardwareEncoderCapabilities: false,
					...(caps ?? {}),
				} as never;
			},
			prewarm: async () => {
				await rawInvoke('voice_engine_prewarm');
			},
			getVoiceEngineReadiness: async () => {
				const readiness = await tryInvoke<{ready: boolean; reason?: string}>('voice_engine_get_readiness');
				return readiness ?? {ready: false, reason: 'bridge-unavailable'};
			},
			connect: async (options: {url: string; token: string}) => {
				await rawInvoke('voice_engine_connect', {url: options.url, token: options.token});
			},
			disconnect: async () => {
				await rawInvoke('voice_engine_disconnect');
			},
			isConnected: async () => Boolean(await tryInvoke<boolean>('voice_engine_is_connected')),
			publishMicrophone: async (options?: {
				echoCancellation?: boolean;
				noiseSuppression?: boolean;
				autoGainControl?: boolean;
				deepFilter?: boolean;
				deviceId?: string;
				maxBitrateBps?: number;
			}) => {
				// connect() already publishes the mic (see voice-native's
				// VoiceEngine::connect) — there is no separate "arm without
				// publishing" step. What this DOES carry is the mic-processing
				// mode: the client calls publishMicrophone with the resolved
				// voice-processing booleans, and "Direct input" (studio mode)
				// sends echoCancellation/noiseSuppression/autoGainControl (and
				// deepFilter) all false for a 100%-untouched mic. Apply those to
				// the native ADM via voice_engine_set_audio_processing.
				//
				// TRI-STATE (fixes the distorted-mic bug): forward the client's
				// ACTUAL values UNTOUCHED. Previously this coerced each undefined
				// to `true` (`?? true`), which force-enabled full-strength WebRTC
				// AEC/AGC/NS on every desktop mic even when the user never asked
				// for processing — the source of the horrible/distorted mic. The
				// Rust command now takes Option<bool> per field: an omitted field
				// (undefined here) is left at WebRTC's own default rather than
				// forced on, and only an explicit `false` disables a stage. So we
				// pass the raw options straight through — undefined stays
				// undefined (serialized as absent → None on the Rust side).
				// deepFilter is still intentionally ignored: the native engine
				// applies no LiveKit noise-reduction track filter, so there's
				// nothing to turn off (raw already).
				//
				// NOTE on maxBitrateBps: the native mic is published at a fixed
				// high-quality tier (128 kbps, no DTX) inside voice-native at
				// connect time; there is no live-rebitrate command in this slice,
				// so this value is accepted but not re-applied here (it is NOT
				// silently forcing anything wrong — the fixed tier already
				// exceeds the client's typical request).
				// tryInvoke never throws; a "not connected" here is swallowed
				// (processing applies on the next connect/publish anyway).
				await tryInvoke('voice_engine_set_audio_processing', {
					echoCancellation: options?.echoCancellation,
					noiseSuppression: options?.noiseSuppression,
					autoGainControl: options?.autoGainControl,
				});
				// Forward the requested input device so the client's mic picker
				// actually selects a device (previously dropped entirely). The
				// native side resolves the WebAudio-style id to a real ADM GUID
				// and no-ops gracefully if it can't match one.
				if (options?.deviceId) {
					await tryInvoke('voice_engine_set_audio_input_device', {
						deviceId: options.deviceId,
					});
				}
				const connected = await tryInvoke<boolean>('voice_engine_is_connected');
				return connected ? {ok: true} : {ok: false, error: {code: 'not-connected', message: 'not connected'}};
			},
			setMicEnabled: async (enabled: boolean) => {
				try {
					await rawInvoke('voice_engine_set_mic_enabled', {enabled});
					return {ok: true};
				} catch (err) {
					return {ok: false, error: {code: 'native-error', message: String(err)}};
				}
			},
			setSpeakingDetection: async (options: {localThresholdRms: number; remoteThresholdRms: number}) => {
				await tryInvoke('voice_engine_set_speaking_detection', {
					localThresholdRms: options.localThresholdRms,
					remoteThresholdRms: options.remoteThresholdRms,
				});
			},
			// The v2 pipeline addresses remote tracks by participant identity +
			// source (camera/microphone/screenshare), NOT trackSid — the real
			// object here is {participantIdentity, source, subscribed, ...} and
			// never carries a trackSid (passing it yielded "missing required key
			// trackSid"). Rust resolves the concrete publication from these two.
			setRemoteTrackSubscription: async (options: {
				participantIdentity: string;
				source: string;
				subscribed: boolean;
			}) => {
				await rawInvoke('voice_engine_set_remote_track_subscription', {
					participantIdentity: options.participantIdentity,
					source: options.source,
					subscribed: options.subscribed,
				});
			},
			// Rust already returns the bridge-shaped {deviceId, label, isDefault}
			// objects (see voice-native's AudioDevice) — plain passthrough, same
			// convention as getGpuInfo below.
			listAudioInputDevices: async () => (await tryInvoke('voice_engine_list_audio_input_devices')) ?? ([] as never),
			listAudioOutputDevices: async () =>
				(await tryInvoke('voice_engine_list_audio_output_devices')) ?? ([] as never),
			setAudioOutputDevice: async (deviceId: string) => {
				await rawInvoke('voice_engine_set_audio_output_device', {deviceId});
			},
			// JS facade signature is two args (participantSid, volume); the IPC
			// side takes one options object — see native-voice-engine-scope memory
			// note on this layer mismatch.
			setParticipantVolume: async (participantSid: string, volume: number) => {
				await tryInvoke('voice_engine_set_participant_volume', {participantSid, volume});
				// volume 0 for a participant is the deafen signal on the native path.
				if (volume <= 0) VoiceDiagnostics.recordDeafen(true);
			},
			onEvent: (callback: (event: {type: string; payload: Record<string, unknown>}) => void) =>
				onEvent<{type: string; payload: Record<string, unknown>}>('voice-engine-event', callback),

			// --- P2/P3: not yet implemented. Must exist as functions (the
			// selection gate checks typeof === 'function' for every entry in
			// VOICE_ENGINE_V2_BRIDGE_METHODS) but genuinely cannot succeed yet —
			// reject clearly rather than silently no-op, so a caller that
			// forgets to feature-detect gets a real error instead of quietly
			// broken video/screenshare/stats. ---
			// These are POLLED/probed on a timer by the client (stats every ~1s,
			// ADM state + hw-encoder caps on connect). Rejecting them made
			// NativeVoiceStatsSession/NativeAudioDeviceModuleState/
			// NativeHardwareEncoderCapabilities log a warning on EVERY poll —
			// per-second console spam (and, with telemetry on, a webhook flood).
			// getConnectionStats now returns REAL native stats; the other two
			// return benign valid-empty values (accurate "nothing available yet"
			// for a P1 audio-only slice) and stay silent. Not faking
			// functionality — the empty ones are read-only queries whose honest
			// answer right now is "empty".
			// Real native WebRTC stats (rtt / bitrate / packet loss) for the
			// "Stats for Nerds" panel. Uses tryInvoke (not rawInvoke) so a stats
			// poll that fails degrades to the empty payload instead of throwing —
			// which is the whole point of routing it here rather than rejecting:
			// no per-second warning re-spam.
			getConnectionStats: async () =>
				((await tryInvoke('voice_engine_get_connection_stats')) ?? {
					rttMs: null,
					outbound: [],
					inbound: [],
				}) as never,
			getAudioDeviceModuleState: async () => ({status: 'ready'}) as never,
			getHardwareEncoderCapabilities: async () =>
				({
					available: false,
					backend: 'none',
					codecs: [],
					zeroCopy: false,
					nativeInputs: [],
				}) as never,
			pushPcm: () => Promise.reject(new Error('voiceEngine: not implemented (P3)')),
			// Native screen-share publish. The actual invoke fires from
			// nativeScreenCapture.start (which has the source id); here we just
			// STASH the encode options keyed by captureId for start() to join.
			// Returning resolved (not rejecting) lets the coordinator proceed to
			// its startCapture step, which is where the real publish happens.
			publishScreen: async (options: {
				captureId: string;
				width: number;
				height: number;
				codec?: string;
				maxBitrateBps?: number;
				maxFramerate?: number;
			}) => {
				// Codec: HONOR the user's picker. The client resolves its
				// screen-share codec setting (Settings › Voice) into `options.codec`
				// — an explicit value there is the user's choice (or the client's own
				// capability-based auto pick) and we pass it through verbatim. Only
				// when it's absent (the client left it to us, e.g. its WebKitGTK
				// capability detector couldn't determine support) do we pick a smart
				// default from the GPU/CPU (pickSmartScreenCodec).
				const codec =
					options.codec && options.codec.length > 0
						? options.codec
						: await pickSmartScreenCodec();
				// Bitrate floor so a high-res share isn't starved into a blocky mess
				// (the client sometimes requests conservative values): scale by pixel
				// count, min 8 Mbps, cap 25 Mbps.
				const pixels = Math.max(1, options.width * options.height);
				const bitrateFloor = Math.min(25_000_000, Math.max(8_000_000, Math.round(pixels * 3)));
				const finalBitrate = Math.max(options.maxBitrateBps ?? 0, bitrateFloor);
				pendingScreenPublishByCaptureId.set(options.captureId, {
					width: options.width,
					height: options.height,
					codec,
					maxBitrateBps: finalBitrate,
					maxFramerate: options.maxFramerate,
				});
				VoiceDiagnostics.recordScreenPublish({
					codec,
					width: options.width,
					height: options.height,
					bitrateBps: finalBitrate,
				});
			},
			// updateScreenShareEncoding stays unimplemented: capabilities report
			// screenShareEncodingUpdate:false, so the coordinator restarts
			// (republishes) instead of calling this — never invoked.
			updateScreenShareEncoding: () => Promise.reject(new Error('voiceEngine: not implemented (P2)')),
			unpublishScreen: async () => {
				// Clear any un-joined stash and tear down the live publication.
				pendingScreenPublishByCaptureId.clear();
				await rawInvoke('voice_engine_unpublish_screen');
			},
			publishScreenAudio: () => Promise.reject(new Error('voiceEngine: not implemented (P3)')),
			pushScreenAudioPcm: () => Promise.reject(new Error('voiceEngine: not implemented (P3)')),
			pushScreenAudioFloat: () => Promise.reject(new Error('voiceEngine: not implemented (P3)')),
			unpublishScreenAudio: () => Promise.reject(new Error('voiceEngine: not implemented (P3)')),
			publishData: async (options: {
				payload: ArrayBuffer | ArrayBufferView;
				reliable?: boolean;
				topic?: string;
				destinationIdentities?: string[];
			}) => {
				// Normalize the binary payload to a plain number[] — Tauri IPC
				// turns a JSON number array into Rust's Vec<u8>.
				const p = options.payload;
				const view =
					p instanceof ArrayBuffer
						? new Uint8Array(p)
						: new Uint8Array(p.buffer, p.byteOffset, p.byteLength);
				await rawInvoke('voice_engine_publish_data', {
					payload: Array.from(view),
					topic: options.topic ?? null,
					reliable: options.reliable ?? false,
					destinationIdentities: options.destinationIdentities ?? [],
				});
				VoiceDiagnostics.recordDataPacket();
			},
			listCameraDevices: async () => {
				// Rust CameraDevice is {id,label}; the client wants {deviceId,label}.
				const list =
					(await tryInvoke<Array<{id: string; label: string}>>('voice_engine_list_camera_devices')) ?? [];
				return list.map((d) => ({deviceId: d.id, label: d.label})) as never;
			},
			publishCamera: async (options: {
				deviceId?: string;
				width?: number;
				height?: number;
				frameRate?: number;
				codec?: string;
				maxBitrateBps?: number;
			}) => {
				const width = options.width ?? 1280;
				const height = options.height ?? 720;
				const frameRate = options.frameRate ?? 30;
				await rawInvoke('voice_engine_publish_camera', {
					deviceId: options.deviceId ?? '',
					width,
					height,
					fps: Math.round(frameRate),
					maxBitrateBps: options.maxBitrateBps ?? null,
					codec: options.codec ?? null,
				});
				cameraPublishing = true;
				VoiceDiagnostics.recordCameraPublish({deviceId: options.deviceId ?? '', width, height});
				// The client wants a {trackSid,width,height,frameRate} info; the
				// concrete room-side SID is owned by Rust and not needed by the
				// local tile (it keys the LOCAL preview off this), so a stable
				// synthetic id is fine.
				return {trackSid: 'native-camera', width, height, frameRate} as never;
			},
			updateCameraCapture: () => Promise.reject(new Error('voiceEngine: not implemented (P2)')),
			publishNativeCameraSink: () => Promise.reject(new Error('voiceEngine: not implemented (P2)')),
			publishProcessedCamera: () => Promise.reject(new Error('voiceEngine: not implemented (P2)')),
			pushProcessedCameraFrame: () => Promise.reject(new Error('voiceEngine: not implemented (P2)')),
			pushCameraBackgroundFrame: () => Promise.reject(new Error('voiceEngine: not implemented (P2)')),
			clearCameraBackgroundFrame: () => Promise.reject(new Error('voiceEngine: not implemented (P2)')),
			publishDeviceScreenShare: () => Promise.reject(new Error('voiceEngine: not implemented (P2)')),
			unpublishCamera: async () => {
				cameraPublishing = false;
				await tryInvoke('voice_engine_unpublish_camera');
			},
			isPublishingCamera: async () => cameraPublishing,
			startCameraPreview: async (options: {
				deviceId?: string;
				width?: number;
				height?: number;
				frameRate?: number;
				codec?: string;
				maxBitrateBps?: number;
			}) => {
				// Preview == publish on the native path: publishing the camera is
				// what produces the video the local tile (and everyone else) sees.
				const width = options.width ?? 1280;
				const height = options.height ?? 720;
				const frameRate = options.frameRate ?? 30;
				await rawInvoke('voice_engine_publish_camera', {
					deviceId: options.deviceId ?? '',
					width,
					height,
					fps: Math.round(frameRate),
					maxBitrateBps: options.maxBitrateBps ?? null,
					codec: options.codec ?? null,
				});
				cameraPublishing = true;
				return {trackSid: 'native-camera', width, height, frameRate} as never;
			},
			stopCameraPreview: async () => {
				cameraPublishing = false;
				await tryInvoke('voice_engine_unpublish_camera');
			},
			onVideoFrame: (callback: (frame: {meta: Record<string, unknown>; data: ArrayBuffer}) => void) => {
				// Remote video (watch others' screenshare/camera). Rust decodes
				// each remote video track and pushes frames through a Tauri
				// Channel as raw ArrayBuffers laid out as:
				//   [u32 LE header-len][JSON header][I420 bytes]
				// We split that back into {meta, data} — the shape the client's
				// createInboundVideoBridge consumes (it builds a WebCodecs
				// VideoFrame{format:'I420'} → MediaStreamTrackGenerator).
				const channel = newTauriChannel<ArrayBuffer | {data?: number[]} | number[]>();
				if (!channel) return noopUnsub();
				channel.onmessage = (raw) => {
					try {
						// The Channel delivers InvokeResponseBody::Raw as an
						// ArrayBuffer in modern runtimes; guard the shapes older
						// runtimes might hand us (number[] / {data:number[]}).
						let buf: ArrayBuffer;
						if (raw instanceof ArrayBuffer) {
							buf = raw;
						} else if (Array.isArray(raw)) {
							buf = new Uint8Array(raw).buffer;
						} else if (raw && Array.isArray((raw as {data?: number[]}).data)) {
							buf = new Uint8Array((raw as {data: number[]}).data).buffer;
						} else {
							return;
						}
						const dv = new DataView(buf);
						const headerLen = dv.getUint32(0, true);
						const headerBytes = new Uint8Array(buf, 4, headerLen);
						const meta = JSON.parse(new TextDecoder().decode(headerBytes)) as Record<string, unknown>;
						// The I420 pixels are everything after the header. Copy into
						// a standalone ArrayBuffer so downstream can transfer/hold it.
						const data = buf.slice(4 + headerLen);
						VoiceDiagnostics.recordRemoteFrame(meta);
						callback({meta, data});
					} catch {
						/* malformed frame — drop it, keep the stream alive */
					}
				};
				void rawInvoke('voice_engine_start_video', {channel}).catch(() => undefined);
				return () => {
					void tryInvoke('voice_engine_stop_video');
				};
			},
		} as never,

		// --- desktop info ---
		getDesktopInfo: async () => {
			const info = await tryInvoke<Record<string, unknown>>('desktop_info');
			return {
				version: '0.1.0',
				channel: 'stable',
				buildVariant: 'default',
				arch: 'x64',
				hardwareArch: 'x64',
				runningUnderRosetta: false,
				os: platform,
				osVersion: '',
				electronVersion: '',
				chromeVersion: '',
				nodeVersion: '',
				waylandSession: false,
				portable: false,
				flatpak: false,
				flatpakAppId: null,
				chromiumRuntime: {enableFeatures: [], disableFeatures: [], switches: []},
				...(info ?? {}),
			} as never;
		},

		// GPU adapters via DXGI. Feeds GpuEncoderCapabilities so the codec
		// picker knows which screen-share codecs have hardware encoders;
		// without it the client assumes software-only and publishes CPU AV1
		// (blurry + single-digit fps). Throw on failure so the client's
		// gpu-report path treats it as "unavailable" instead of crashing on a
		// null devices array.
		getGpuInfo: async () => {
			const info = await tryInvoke<Record<string, unknown>>('desktop_get_gpu_info');
			if (!info) throw new Error('gpu info unavailable');
			return info as never;
		},

		// --- deep links ---
		getInitialDeepLink: async () => {
			const url = await tryInvoke<string | null>('desktop_initial_deep_link');
			return url ?? null;
		},
		onDeepLink: (cb: (url: string) => void) => onEvent<string>('deep-link', cb),
		// RPC-based in-app navigation — an Electron IPC channel we don't have a
		// Tauri equivalent for (deep links are already handled via onDeepLink
		// above). Present as a real function returning a noop-unsub so the
		// client's `typeof electronApi.onRpcNavigate === 'function'` check
		// passes and it stops logging "onRpcNavigate not available on this
		// host version" every deep-link init.
		onRpcNavigate: (_cb: (path: string) => void) => noopUnsub(),

		// --- context menu / notification click hooks ---
		onTextareaContextMenu: noopUnsub(),
		onNotificationClick: (cb: (id: string, url?: string) => void) =>
			onEvent<{id: string; url?: string}>('notification-click', (p) => cb(p.id, p.url)),

		// --- notifications ---
		showNotification: async (payload: {title: string; body: string; id?: string; url?: string}) => {
			const id = payload.id ?? `n${Date.now()}`;
			await tryInvoke('plugin:notification|notify', {
				options: {title: payload.title, body: payload.body},
			});
			return {id};
		},
		closeNotification: noop,
		closeNotifications: noop,

		// --- spellcheck (delegate to WebView2 built-in; stub the bridge) ---
		onSpellcheckStateChanged: noopUnsub(),
		spellcheckGetAvailableLanguages: async () => [navigator.language],
		spellcheckSetState: async (state: unknown) => state as never,

		// --- autostart (Tauri autostart plugin) ---
		autostartEnable: async () => {
			await tryInvoke('plugin:autostart|enable');
		},
		autostartDisable: async () => {
			await tryInvoke('plugin:autostart|disable');
		},
		autostartIsEnabled: async () => Boolean(await tryInvoke<boolean>('plugin:autostart|is_enabled')),
		autostartIsInitialized: async () => true,
		autostartMarkInitialized: async () => undefined,

		// --- global key hook (PTT / mute / deafen via Tauri global-shortcut) ---
		globalKeyHookStart: async () => Boolean(await tryInvoke<boolean>('desktop_global_hook_start')),
		globalKeyHookStop: async () => {
			await tryInvoke('desktop_global_hook_stop');
		},
		onGlobalKeyEvent: (cb: (e: unknown) => void) => onEvent('global-key-event', cb),
		onGlobalMouseEvent: (cb: (e: unknown) => void) => onEvent('global-mouse-event', cb),

		// --- media / input-monitoring permissions (WebView2 auto-grants) ---
		checkInputMonitoringAccess: async () => true,
		checkMediaAccess: async () => 'granted' as const,
		requestMediaAccess: async () => true,
		openInputMonitoringSettings: async () => undefined,
		openMediaAccessSettings: async () => undefined,

		// --- native window controls (native title bar buttons) ---
		windowMinimize: async () => {
			await tryInvoke('plugin:window|minimize');
		},
		windowMaximize: async () => {
			await tryInvoke('plugin:window|toggle_maximize');
		},
		windowClose: async () => {
			await tryInvoke('plugin:window|close');
		},
		windowIsMaximized: async () => Boolean(await tryInvoke<boolean>('plugin:window|is_maximized')),
		onWindowMaximizeChange: (cb: (maximized: boolean) => void) =>
			onEvent<boolean>('window-maximize-change', cb),

		// --- clipboard ---
		clipboardWriteText: async (text: string) => {
			await tryInvoke('plugin:clipboard-manager|write_text', {label: null, text});
		},
		clipboardReadText: async () =>
			(await tryInvoke<string>('plugin:clipboard-manager|read_text')) ?? '',

		// --- taskbar / badge ---
		setBadgeCount: noop,
		flashFrame: noop,
		stopFlashFrame: noop,
		setTaskbarProgress: noop,
	};

	return api as unknown as ElectronAPI;
}

/**
 * Detect the Tauri desktop build. We do NOT rely on `window.__TAURI__` being
 * present at import time (with withGlobalTauri it is injected by an init script,
 * but ordering vs. this module can vary). Instead we key off
 * `window.__FLUXER_PROXY__`, which the Rust backend sets in the FIRST
 * initialization_script — guaranteed to run before any app module. The invoke
 * bridge (`window.__TAURI__`) is resolved lazily when a shim method is actually
 * called, by which point it is always available.
 */
function isTauriDesktop(): boolean {
	if (typeof window === 'undefined') return false;
	const w = window as unknown as {__FLUXER_PROXY__?: unknown; __TAURI__?: unknown; __TAURI_INTERNALS__?: unknown};
	return Boolean(w.__FLUXER_PROXY__ || w.__TAURI__ || w.__TAURI_INTERNALS__);
}

// Route the reference client's getDisplayMedia (screen share) through our native
// WGC + WASAPI capture pipeline. WebView2 cannot pre-select a getDisplayMedia
// source (so it always shows its "Choose what to share" dialog) and never
// delivers system audio — the native path fixes both. If a source hasn't been
// picked in-app, or native capture fails, we fall back to the real
// getDisplayMedia (dialog).
// Pull a numeric value out of a MediaTrackConstraints field that may be a bare
// number or a `{ideal|exact|max}` constraint object.
function constraintNumber(v: unknown): number | undefined {
	if (typeof v === 'number') return v;
	if (v && typeof v === 'object') {
		const o = v as {ideal?: number; exact?: number; max?: number};
		return o.ideal ?? o.exact ?? o.max;
	}
	return undefined;
}

function installGetDisplayMediaOverride(): void {
	const md = navigator.mediaDevices as MediaDevices | undefined;
	if (!md || typeof md.getDisplayMedia !== 'function') return;
	if ((md as unknown as {__ruxerPatched?: boolean}).__ruxerPatched) return;
	const original = md.getDisplayMedia.bind(md);
	md.getDisplayMedia = async (constraints?: DisplayMediaStreamOptions): Promise<MediaStream> => {
		if (getRecordedCaptureSource()) {
			try {
				// This getDisplayMedia call is the LOCAL SELF-PREVIEW only. In
				// native-voice mode the PUBLISHED share is captured separately by
				// the native voice engine (voice_engine_publish_screen) at full
				// quality — so this must NOT also run a full-res capture, or the
				// machine captures the same screen TWICE and the "preview" is
				// actually a second broadcast-quality stream (the reported "preview
				// just plays the actual screenshare"). Cap it to a small preview
				// resolution + modest fps so it's a light thumbnail, not a duplicate
				// full capture. The client only uses this for the own-stream preview
				// tile, which is tiny.
				const video = constraints?.video;
				let fps: number | undefined;
				if (video && typeof video === 'object') {
					fps = constraintNumber((video as MediaTrackConstraints).frameRate);
				}
				const PREVIEW_MAX_WIDTH = 480;
				const PREVIEW_MAX_FPS = 15;
				return await startNativeDisplayCapture({
					fps: Math.min(fps ?? PREVIEW_MAX_FPS, PREVIEW_MAX_FPS),
					maxWidth: PREVIEW_MAX_WIDTH,
				});
			} catch (err) {
				console.warn('[tauri-shim] native display capture failed; using WebView2 picker', err);
			}
		}
		return original(constraints);
	};
	(md as unknown as {__ruxerPatched?: boolean}).__ruxerPatched = true;
}

// WebView2 reports device labels (and often the non-default devices themselves)
// only AFTER a getUserMedia grant in the session. `--auto-accept-camera-and-
// microphone-capture` auto-grants, so a one-shot warm-up unlocks the real
// input/output/camera lists — otherwise the settings pickers only ever show
// "Default". Audio and video are warmed SEPARATELY so a machine with no webcam
// (video getUserMedia rejects) still unlocks the audio devices.
function warmUpMediaDevices(): void {
	const md = navigator.mediaDevices as MediaDevices | undefined;
	if (!md || typeof md.getUserMedia !== 'function') return;
	const warm = (constraints: MediaStreamConstraints) => {
		md.getUserMedia(constraints)
			.then((stream) => stream.getTracks().forEach((t) => t.stop()))
			.catch(() => undefined);
	};
	warm({audio: true});
	warm({video: true});
}

// F12 / Ctrl+Shift+I toggles the webview inspector — bridged to a Tauri
// command because neither WebView2 nor WebKitGTK expose a default binding in
// a packaged (release) app.
function installDevtoolsHotkey(): void {
	window.addEventListener('keydown', (event) => {
		const combo = event.key === 'F12' || (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'i');
		if (!combo) return;
		event.preventDefault();
		void tryInvoke('desktop_toggle_devtools');
	});
}

// Cached consent flag for installErrorTelemetry's hot path (console.error is
// called all over a large app; we must not do any string/JSON work there
// before knowing telemetry is even on). `null` = not yet loaded from Rust,
// treated as "disabled" so the very first errors before the async load
// resolves are just skipped rather than paying the cost speculatively.
// Kept in sync with the Settings toggle via notifyTelemetryConsentChanged
// (called from Telemetry.ts's setTelemetryEnabled) so flipping the switch
// takes effect immediately without polling.
let telemetryConsentCache: boolean | null = null;

/** Exported so Telemetry.ts (Settings > Desktop > Privacy toggle) can push a
 * fresh value into this module's cache the moment the user flips it, instead
 * of the hot path running on a stale flag until some unrelated refresh. */
export function notifyTelemetryConsentChanged(enabled: boolean): void {
	telemetryConsentCache = enabled;
}

// Opt-in error telemetry. Forwards console.error + uncaught errors + unhandled
// rejections to a Tauri command that posts them to a webhook — but ONLY if the
// user agreed at the first-launch prompt. Rust is still the ultimate source of
// truth and re-checks consent itself (telemetry.rs::report), but gating here
// too matters: without it, EVERY console.error call anywhere in the app —
// including with telemetry off — would pay for an Error-scan, a map+join+
// JSON.stringify over all args, and an IPC dispatch, on the hot path of any
// error/warning in a large production client. Kept dependency-light and
// re-entrancy-safe so a failure inside the forwarder can't loop.
function installErrorTelemetry(): void {
	// Prime the cache once; cheap fire-and-forget, no polling.
	void tryInvoke<boolean | null>('telemetry_get_enabled').then((v) => {
		telemetryConsentCache = v ?? false;
	});

	let reporting = false;
	const send = (kind: string, message: string, stack?: string) => {
		if (reporting) return; // guard: our own failure must not re-trigger us
		reporting = true;
		try {
			void tryInvoke('telemetry_report', {kind, message, stack: stack ?? null});
		} finally {
			reporting = false;
		}
	};

	// Shared arg-flattener for console.error / console.warn wrappers.
	const flatten = (args: unknown[]): {message: string; stack?: string} => {
		const errArg = args.find((a) => a instanceof Error) as Error | undefined;
		const message = args
			.map((a) => (a instanceof Error ? a.message : typeof a === 'string' ? a : safeStringify(a)))
			.join(' ')
			.slice(0, 1000);
		return {message, stack: errArg?.stack};
	};

	const originalError = console.error.bind(console);
	console.error = (...args: unknown[]) => {
		originalError(...args);
		if (!telemetryConsentCache) return; // hot-path gate: skip all work below when off/unknown
		try {
			const {message, stack} = flatten(args);
			send('console.error', message, stack);
		} catch {
			/* never let telemetry break logging */
		}
	};

	// console.warn too (user-requested). Deduped Rust-side by message hash
	// (telemetry.rs seen_hashes), so a repeated warning is sent AT MOST ONCE
	// per session — no warning spam in the webhook even for a warn that fires
	// on a timer.
	const originalWarn = console.warn.bind(console);
	console.warn = (...args: unknown[]) => {
		originalWarn(...args);
		if (!telemetryConsentCache) return;
		try {
			const {message, stack} = flatten(args);
			send('console.warn', message, stack);
		} catch {
			/* never let telemetry break logging */
		}
	};

	window.addEventListener('error', (event) => {
		if (!telemetryConsentCache) return;
		send('uncaught', String(event.message ?? 'unknown error'), event.error?.stack);
	});
	window.addEventListener('unhandledrejection', (event) => {
		if (!telemetryConsentCache) return;
		const reason = event.reason;
		const message = reason instanceof Error ? reason.message : String(reason);
		send('unhandledrejection', message.slice(0, 1000), reason instanceof Error ? reason.stack : undefined);
	});
}

function safeStringify(value: unknown): string {
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}

export function installDesktopTauriShim(): void {
	if (typeof window === 'undefined') return;
	if (!isTauriDesktop()) return;
	if ((window as unknown as {electron?: unknown}).electron) return;
	try {
		(window as unknown as {electron: ElectronAPI}).electron = buildElectronShim();
		installGetDisplayMediaOverride();
		warmUpMediaDevices();
		installDevtoolsHotkey();
		installErrorTelemetry();
		installVoiceDiagnosticsHotkey();
	} catch (err) {
		console.error('[tauri-shim] install failed', err);
	}
}

installDesktopTauriShim();
