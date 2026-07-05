// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Native screen-share bridge (Tauri desktop).
//
// WebView2 cannot programmatically select a getDisplayMedia source (its
// ScreenCaptureStarting event can only allow/cancel, never pick), and its
// getDisplayMedia never delivers system audio. So instead of getDisplayMedia we
// capture the user-picked source NATIVELY in Rust — Windows.Graphics.Capture
// for video, WASAPI loopback for system audio — stream the frames over the
// local proxy's WebSocket, and reassemble a MediaStream here:
//
//   video: JPEG frames -> createImageBitmap -> <canvas> -> canvas.captureStream()
//   audio: f32 PCM     -> AudioWorklet ring -> MediaStreamAudioDestinationNode
//
// The result is returned from the shim's getDisplayMedia override, so the
// reference client's existing LiveKit publish path picks up BOTH tracks with no
// WebView2 "Choose what to share" dialog. If anything fails, the caller falls
// back to the real getDisplayMedia (dialog).

type TauriInvoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

function tauriInvoke(): TauriInvoke | null {
	const t = (window as unknown as {__TAURI__?: {core: {invoke: TauriInvoke}}}).__TAURI__;
	return t?.core?.invoke ?? null;
}

function proxyBase(): string | null {
	const p = (window as unknown as {__FLUXER_PROXY__?: {base?: string}}).__FLUXER_PROXY__;
	return p?.base ?? null;
}

function wsBase(): string | null {
	const base = proxyBase();
	if (!base) return null;
	return base.replace(/^http/, 'ws');
}

// The most recent source id the in-app picker selected. Recorded by the shim
// (which the picker calls) so the getDisplayMedia override knows what to grab.
let lastSourceId: string | null = null;
export function recordCaptureSource(sourceId: string | null | undefined): void {
	if (sourceId) lastSourceId = sourceId;
}
export function getRecordedCaptureSource(): string | null {
	return lastSourceId;
}

const JPEG_SOI_0 = 0xff;
const JPEG_SOI_1 = 0xd8;

interface ActiveCapture {
	stop: () => void;
}
let active: ActiveCapture | null = null;

export interface NativeCaptureOptions {
	sourceId?: string | null;
	/** Target frame rate (from the reference's screen-share settings). */
	fps?: number;
	/** Target capture width (downscaled in Rust if the source is larger). */
	maxWidth?: number;
}

/**
 * Whether to capture system audio for `sourceId`. Mirrors the reference's
 * `shouldIncludeAudioForShare`: a window share uses the "Capture app audio"
 * toggle, a screen share uses "Capture desktop audio". (We read the toggle
 * directly because the reference strips `audio` from the getDisplayMedia
 * constraints on desktop when its native-audio arming fails — which it always
 * does here since we ship no `electronApi.nativeAudio` bridge.)
 */
// IMPORTANT: VoiceSettings is loaded via a LAZY dynamic import, never a
// top-level import. This module is imported by the desktop shim, which runs
// before the app's normal module-init order; a static `import VoiceSettings`
// here forces VoiceSettings' whole module graph to evaluate too early and left
// the VoiceSettings singleton undefined when the voice engine constructed
// (crash: `getVoiceProcessingModeForDeviceLabel` on undefined). The dynamic
// import defers loading to screen-share time, by which point it's already
// initialized in the normal order.
async function wantAudioForSource(sourceId: string): Promise<boolean> {
	try {
		const {default: VoiceSettings} = await import('@app/features/voice/state/VoiceSettings');
		if (sourceId.startsWith('window:')) return VoiceSettings.getShareAppAudio() === true;
		return VoiceSettings.getShareDesktopAudio() === true;
	} catch {
		return false;
	}
}

/**
 * Start native capture of the picked source and return a MediaStream with a
 * video track (+ an audio track only when the user enabled Capture App/Desktop
 * Audio). Honors the reference's fps + resolution settings. Throws if the
 * native pipeline can't start (caller falls back to real getDisplayMedia).
 */
export async function startNativeDisplayCapture(opts: NativeCaptureOptions = {}): Promise<MediaStream> {
	const invoke = tauriInvoke();
	const ws = wsBase();
	const source = opts.sourceId ?? lastSourceId;
	if (!invoke || !ws || !source) {
		throw new Error('native capture unavailable (no tauri/proxy/source)');
	}

	// Tear down any prior capture first.
	stopNativeDisplayCapture();

	const fps = Math.round(opts.fps ?? 30);
	const maxWidth = Math.round(opts.maxWidth ?? 1920);
	const audio = await wantAudioForSource(source);

	await invoke('native_capture_start', {sourceId: source, fps, maxWidth, audio});

	const cleanups: Array<() => void> = [];
	const doStop = () => {
		for (const c of cleanups.splice(0)) {
			try {
				c();
			} catch {
				/* ignore */
			}
		}
		void invoke('native_capture_stop').catch(() => undefined);
	};

	let videoTrack: MediaStreamTrack;
	try {
		videoTrack = await startVideo(ws, fps, cleanups);
	} catch (err) {
		doStop();
		throw err;
	}

	// Audio only when the toggle is on; still best-effort (a machine with no
	// render endpoint yields video-only rather than failing the whole share).
	let audioTrack: MediaStreamTrack | null = null;
	if (audio) {
		try {
			audioTrack = await startAudio(ws, cleanups);
		} catch (err) {
			console.warn('[native-screenshare] audio track unavailable', err);
			audioTrack = null;
		}
	}

	const tracks = audioTrack ? [videoTrack, audioTrack] : [videoTrack];
	const stream = new MediaStream(tracks);

	// When the consumer stops the video track (user ends the share), clean up.
	const onEnded = () => doStop();
	videoTrack.addEventListener('ended', onEnded);
	const originalStop = videoTrack.stop.bind(videoTrack);
	videoTrack.stop = () => {
		originalStop();
		doStop();
	};

	active = {stop: doStop};
	return stream;
}

export function stopNativeDisplayCapture(): void {
	const cur = active;
	active = null;
	if (cur) {
		try {
			cur.stop();
		} catch {
			/* ignore */
		}
	}
}

// --- video ------------------------------------------------------------------

async function startVideo(ws: string, fps: number, cleanups: Array<() => void>): Promise<MediaStreamTrack> {
	const canvas = document.createElement('canvas');
	canvas.width = 1280;
	canvas.height = 720;
	const ctx = canvas.getContext('2d', {alpha: false});
	if (!ctx) throw new Error('2d context unavailable');
	// Paint a black first frame so captureStream produces a track immediately.
	ctx.fillStyle = '#000';
	ctx.fillRect(0, 0, canvas.width, canvas.height);

	const socket = new WebSocket(`${ws}/__cap/v`);
	socket.binaryType = 'arraybuffer';
	cleanups.push(() => socket.close());

	let firstFrame: (() => void) | null = null;
	const gotFirst = new Promise<void>((resolve, reject) => {
		firstFrame = resolve;
		const to = window.setTimeout(() => reject(new Error('native video timeout')), 5000);
		cleanups.push(() => window.clearTimeout(to));
	});

	const decodeAndDraw = async (buf: ArrayBuffer): Promise<void> => {
		const bytes = new Uint8Array(buf);
		let bitmap: ImageBitmap;
		if (bytes[0] === JPEG_SOI_0 && bytes[1] === JPEG_SOI_1) {
			bitmap = await createImageBitmap(new Blob([buf], {type: 'image/jpeg'}));
		} else {
			// Raw-RGBA-with-header fallback: [w u32 le][h u32 le][fmt u32 le][pixels...]
			const dv = new DataView(buf);
			const w = dv.getUint32(0, true);
			const h = dv.getUint32(4, true);
			const pixels = new Uint8ClampedArray(buf, 12, w * h * 4);
			bitmap = await createImageBitmap(new ImageData(pixels, w, h));
		}
		if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
			canvas.width = bitmap.width;
			canvas.height = bitmap.height;
		}
		ctx.drawImage(bitmap, 0, 0);
		bitmap.close?.();
		if (firstFrame) {
			firstFrame();
			firstFrame = null;
		}
	};

	// Latest-frame-wins pump. onmessage only stashes the newest frame; a single
	// decode loop drains it. Decoding every message inline (the old shape) let
	// the event queue grow without bound whenever decode+draw ran slower than
	// frames arrived — latency climbed to seconds while fps cratered. Dropping
	// stale frames bounds delay to ~one decode and lets fps degrade gracefully
	// to whatever the machine can actually decode.
	let latest: ArrayBuffer | null = null;
	let wake: (() => void) | null = null;
	let running = true;
	cleanups.push(() => {
		running = false;
		wake?.();
	});
	socket.onmessage = (ev: MessageEvent) => {
		const buf = ev.data as ArrayBuffer;
		if (!(buf instanceof ArrayBuffer) || buf.byteLength < 4) return;
		latest = buf;
		wake?.();
	};
	socket.onerror = () => {
		/* surfaced via the timeout / track end */
	};
	void (async () => {
		while (running) {
			const buf = latest;
			latest = null;
			if (!buf) {
				await new Promise<void>((resolve) => {
					wake = resolve;
				});
				wake = null;
				continue;
			}
			try {
				await decodeAndDraw(buf);
			} catch (err) {
				console.warn('[native-screenshare] video frame decode failed', err);
			}
		}
	})();

	await gotFirst;

	const stream = canvas.captureStream(Math.max(1, Math.min(120, fps)));
	const track = stream.getVideoTracks()[0];
	if (!track) throw new Error('canvas captureStream produced no video track');
	try {
		track.contentHint = 'motion';
	} catch {
		/* optional */
	}
	cleanups.push(() => track.stop());
	return track;
}

// --- audio ------------------------------------------------------------------

// Worklet that plays back f32 PCM frames pushed via its message port. A small
// ring buffer smooths jitter; underruns emit silence.
const AUDIO_WORKLET_SRC = `
class NativePcmSink extends AudioWorkletProcessor {
	constructor() {
		super();
		this._queue = [];
		this._channels = 2;
		this.port.onmessage = (e) => {
			if (e.data && e.data.channels) { this._channels = e.data.channels; return; }
			// e.data is a Float32Array of interleaved samples.
			this._queue.push(e.data);
			// Cap backlog (~1s at 48k stereo) to bound latency.
			let total = 0;
			for (const b of this._queue) total += b.length;
			while (total > 48000 * this._channels && this._queue.length > 1) {
				total -= this._queue.shift().length;
			}
		};
	}
	process(_inputs, outputs) {
		const out = outputs[0];
		const frames = out[0] ? out[0].length : 128;
		const ch = out.length;
		let head = this._queue[0];
		let offset = this._offset || 0;
		for (let i = 0; i < frames; i++) {
			for (let c = 0; c < ch; c++) {
				let sample = 0;
				if (head) {
					const idx = offset + (c % this._channels);
					sample = head[idx] || 0;
				}
				out[c][i] = sample;
			}
			offset += this._channels;
			if (head && offset >= head.length) {
				this._queue.shift();
				head = this._queue[0];
				offset = 0;
			}
		}
		this._offset = offset;
		return true;
	}
}
registerProcessor('native-pcm-sink', NativePcmSink);
`;

async function startAudio(ws: string, cleanups: Array<() => void>): Promise<MediaStreamTrack> {
	const socket = new WebSocket(`${ws}/__cap/a`);
	socket.binaryType = 'arraybuffer';
	cleanups.push(() => socket.close());

	// First message is a JSON header describing the PCM format.
	const header = await new Promise<{sampleRate: number; channels: number}>((resolve, reject) => {
		const to = window.setTimeout(() => reject(new Error('native audio header timeout')), 3000);
		cleanups.push(() => window.clearTimeout(to));
		socket.addEventListener(
			'message',
			(ev: MessageEvent) => {
				window.clearTimeout(to);
				try {
					resolve(JSON.parse(String(ev.data)));
				} catch (err) {
					reject(err);
				}
			},
			{once: true},
		);
		socket.addEventListener('error', () => reject(new Error('native audio socket error')), {once: true});
	});

	const ctx = new AudioContext({sampleRate: header.sampleRate});
	cleanups.push(() => void ctx.close().catch(() => undefined));

	const blob = new Blob([AUDIO_WORKLET_SRC], {type: 'application/javascript'});
	const url = URL.createObjectURL(blob);
	try {
		await ctx.audioWorklet.addModule(url);
	} finally {
		URL.revokeObjectURL(url);
	}

	const node = new AudioWorkletNode(ctx, 'native-pcm-sink', {
		numberOfInputs: 0,
		numberOfOutputs: 1,
		outputChannelCount: [Math.max(1, Math.min(2, header.channels))],
	});
	node.port.postMessage({channels: header.channels});

	const dest = ctx.createMediaStreamDestination();
	node.connect(dest);

	socket.onmessage = (ev: MessageEvent) => {
		const buf = ev.data;
		if (buf instanceof ArrayBuffer && buf.byteLength >= 4) {
			node.port.postMessage(new Float32Array(buf), [buf]);
		}
	};

	const track = dest.stream.getAudioTracks()[0];
	if (!track) throw new Error('no audio destination track');
	cleanups.push(() => track.stop());
	return track;
}
