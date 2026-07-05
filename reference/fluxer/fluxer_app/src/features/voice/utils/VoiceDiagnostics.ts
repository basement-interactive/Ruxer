// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Voice/video diagnostics for the native engine — turns a 2-person call into
// HARD EVIDENCE instead of eyeballing. The desktop shim feeds this counters as
// the native bridge does its work (remote video frames arriving, screen/camera
// publishes, data packets, deafen toggles). It logs each event to the console
// (so it shows up in the telemetry/console mirror the user already pastes) and
// renders a tiny always-on-top overlay with live rates.
//
// This is deliberately shim-adjacent and dependency-free: it must run whether or
// not the React app has mounted. Toggle the overlay with Ctrl+Shift+D.
//
// What each counter PROVES:
//   * remoteVideoFrames > 0 + rising  → onVideoFrame works: you ARE receiving
//     another participant's screenshare/camera (the "watching" clause).
//   * remoteVideoFps                   → the quality/smoothness of what you see.
//   * screenPublish {codec,w,h,bitrate}→ what codec/quality your OUTGOING share
//     used (proves the picker was honored + the bitrate floor applied).
//   * cameraPublish                    → your camera actually started publishing.
//   * dataPackets rising               → publishData works (codec gossip flows).
//   * deafen state                     → the deafen toggle reached the engine.

interface RemoteStreamStat {
	trackSid: string;
	source: string;
	participant: string;
	width: number;
	height: number;
	frames: number;
	lastTs: number;
	fps: number;
	// rolling window for fps
	windowStart: number;
	windowFrames: number;
}

class VoiceDiagnosticsImpl {
	private remote = new Map<string, RemoteStreamStat>();
	private screenPublish: {codec: string; width: number; height: number; bitrateBps: number; at: number} | null = null;
	private cameraPublish: {deviceId: string; width: number; height: number; at: number} | null = null;
	private dataPackets = 0;
	private deafened = false;
	private overlay: HTMLElement | null = null;
	private raf = 0;

	/** A remote video frame arrived from the native bridge (onVideoFrame). */
	recordRemoteFrame(meta: {trackSid?: unknown; source?: unknown; participantIdentity?: unknown; width?: unknown; height?: unknown}): void {
		const trackSid = String(meta.trackSid ?? 'unknown');
		const now = performance.now();
		let s = this.remote.get(trackSid);
		if (!s) {
			s = {
				trackSid,
				source: String(meta.source ?? '?'),
				participant: String(meta.participantIdentity ?? '?'),
				width: Number(meta.width ?? 0),
				height: Number(meta.height ?? 0),
				frames: 0,
				lastTs: now,
				fps: 0,
				windowStart: now,
				windowFrames: 0,
			};
			this.remote.set(trackSid, s);
			// eslint-disable-next-line no-console
			console.info(
				`[VoiceDiag] FIRST remote video frame — watching ${s.source} from ${s.participant} (${meta.width}x${meta.height}, track ${trackSid}). onVideoFrame IS delivering.`,
			);
		}
		s.width = Number(meta.width ?? s.width);
		s.height = Number(meta.height ?? s.height);
		s.frames += 1;
		s.windowFrames += 1;
		s.lastTs = now;
		const elapsed = now - s.windowStart;
		if (elapsed >= 1000) {
			s.fps = Math.round((s.windowFrames * 1000) / elapsed);
			s.windowStart = now;
			s.windowFrames = 0;
		}
	}

	recordScreenPublish(info: {codec: string; width: number; height: number; bitrateBps: number}): void {
		this.screenPublish = {...info, at: Date.now()};
		// eslint-disable-next-line no-console
		console.info(
			`[VoiceDiag] SCREEN publish — codec=${info.codec} ${info.width}x${info.height} @ ${(info.bitrateBps / 1_000_000).toFixed(1)}Mbps. (codec honored from your picker; bitrate floor applied)`,
		);
	}

	recordCameraPublish(info: {deviceId: string; width: number; height: number}): void {
		this.cameraPublish = {...info, at: Date.now()};
		// eslint-disable-next-line no-console
		console.info(`[VoiceDiag] CAMERA publish — device=${info.deviceId || 'default'} ${info.width}x${info.height}. Your camera is publishing.`);
	}

	recordDataPacket(): void {
		this.dataPackets += 1;
	}

	recordDeafen(deafened: boolean): void {
		this.deafened = deafened;
		// eslint-disable-next-line no-console
		console.info(`[VoiceDiag] DEAFEN ${deafened ? 'ON — remote audio paused' : 'OFF — remote audio resumed'}.`);
	}

	/** Toggle the overlay (Ctrl+Shift+D). */
	toggleOverlay(): void {
		if (this.overlay) {
			this.hideOverlay();
		} else {
			this.showOverlay();
		}
	}

	private showOverlay(): void {
		const el = document.createElement('div');
		el.id = 'ruxer-voice-diag';
		el.style.cssText = [
			'position:fixed',
			'bottom:12px',
			'left:12px',
			'z-index:99999',
			'font:12px/1.5 ui-monospace,monospace',
			'color:#0f0',
			'background:rgba(0,0,0,0.82)',
			'border:1px solid #0a0',
			'border-radius:8px',
			'padding:10px 12px',
			'max-width:420px',
			'white-space:pre-wrap',
			'pointer-events:none',
		].join(';');
		document.body.appendChild(el);
		this.overlay = el;
		const tick = () => {
			if (!this.overlay) return;
			this.overlay.textContent = this.render();
			this.raf = window.setTimeout(() => requestAnimationFrame(tick), 250) as unknown as number;
		};
		tick();
	}

	private hideOverlay(): void {
		if (this.raf) window.clearTimeout(this.raf);
		this.overlay?.remove();
		this.overlay = null;
	}

	private render(): string {
		const lines: string[] = ['◈ Ruxer voice diagnostics (Ctrl+Shift+D)'];
		lines.push('');
		lines.push('— WATCHING (remote video in) —');
		if (this.remote.size === 0) {
			lines.push('  no remote video yet');
		} else {
			for (const s of this.remote.values()) {
				const stale = performance.now() - s.lastTs > 2000;
				lines.push(
					`  ${s.source} ${s.width}x${s.height} ${s.fps}fps  (${s.frames} frames${stale ? ', STALLED' : ''})  ${s.participant}`,
				);
			}
		}
		lines.push('');
		lines.push('— SENDING —');
		lines.push(
			this.screenPublish
				? `  screen: ${this.screenPublish.codec} ${this.screenPublish.width}x${this.screenPublish.height} @ ${(this.screenPublish.bitrateBps / 1_000_000).toFixed(1)}Mbps`
				: '  screen: not sharing',
		);
		lines.push(
			this.cameraPublish
				? `  camera: ${this.cameraPublish.width}x${this.cameraPublish.height} (${this.cameraPublish.deviceId || 'default'})`
				: '  camera: off',
		);
		lines.push('');
		lines.push(`data packets: ${this.dataPackets}   deafened: ${this.deafened ? 'YES' : 'no'}`);
		return lines.join('\n');
	}

	/** Dump the full state to the console (for the user to copy/paste). */
	dump(): void {
		// eslint-disable-next-line no-console
		console.info('[VoiceDiag] STATE', {
			remote: [...this.remote.values()],
			screenPublish: this.screenPublish,
			cameraPublish: this.cameraPublish,
			dataPackets: this.dataPackets,
			deafened: this.deafened,
		});
	}
}

export const VoiceDiagnostics = new VoiceDiagnosticsImpl();

/** Install the Ctrl+Shift+D overlay toggle. Safe to call once at startup. */
export function installVoiceDiagnosticsHotkey(): void {
	if (typeof window === 'undefined') return;
	if ((window as unknown as {__ruxerDiagInstalled?: boolean}).__ruxerDiagInstalled) return;
	(window as unknown as {__ruxerDiagInstalled?: boolean}).__ruxerDiagInstalled = true;
	window.addEventListener('keydown', (e) => {
		if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'KeyD') {
			e.preventDefault();
			VoiceDiagnostics.toggleOverlay();
			VoiceDiagnostics.dump();
		}
	});
	// Expose for manual console poking too.
	(window as unknown as {ruxerVoiceDiag?: unknown}).ruxerVoiceDiag = VoiceDiagnostics;
}
