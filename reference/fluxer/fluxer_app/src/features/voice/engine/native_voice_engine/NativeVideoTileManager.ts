// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';
import {Logger} from '@app/features/platform/utils/AppLogger';
import {createInboundVideoBridge} from '@app/features/voice/engine/native_voice_engine/createInboundVideoBridge';
import {Store} from '@app/features/voice/engine/Store';
import {
	asVoiceTrackSource,
	isVoiceScreenShareSource,
	VoiceTrackSource,
} from '@app/features/voice/engine/VoiceTrackSource';
import {
	assertNonEmptyString,
	assertOptionalNonEmptyString,
} from '@app/features/voice/engine/v2/VoiceEngineV2AppAdapterAssertions';
import {ScreenShareWatchErrorCode, ScreenShareWatchFailures} from '@app/features/voice/state/ScreenShareWatchFailures';
import type {VoiceEngineV2BridgeApi, VoiceEngineV2BridgeVideoFrame} from '@fluxer/voice_engine_v2/bridge';

const logger = new Logger('NativeVideoTileManager');

export const NATIVE_INBOUND_VIDEO_TRACKS_MAX = 64;
export const NATIVE_RETAINED_LAST_FRAMES_MAX = 8;
export const NATIVE_AUTO_REGISTER_SUPPRESSED_TRACKS_MAX = 64;

const UNKNOWN_TRACK_WARNED_SIDS_MAX = 32;
const UNKNOWN_TRACK_FRAME_COUNT_MAX = 1_000_000;
const OBSERVER_FAILURE_COUNT_MAX = 1_000_000;
const OBSERVER_FAILURE_LOG_INTERVAL = 300;

export interface NativeInboundVideoTrack {
	participantSid: string;
	participantIdentity?: string;
	trackSid: string;
	source: string;
	width: number;
	height: number;
	stream: MediaStream;
}

export interface NativeRetainedVideoFrame {
	trackSid: string;
	width: number;
	height: number;
	timestampUs: number;
	data: ArrayBuffer;
}

interface NativeVideoEntry {
	participantSid: string;
	participantIdentity?: string;
	trackSid: string;
	source: string;
	pushFrame?: (frame: {width: number; height: number; timestampUs: number; data: ArrayBuffer}) => void;
	cleanup: () => Promise<void>;
}

type NativeVideoFrameMetaWithSource = VoiceEngineV2BridgeVideoFrame['meta'] & {
	identity?: unknown;
};

export interface NativeVideoTileManagerStartOptions {
	onFrame?: (frame: VoiceEngineV2BridgeVideoFrame) => void;
}

function frameKey(frame: VoiceEngineV2BridgeVideoFrame): string {
	return frame.meta.trackSid;
}

function extractParticipantConnectionId(identity: string | undefined): string | null {
	if (!identity) return null;
	const match = identity.match(/^user_\d+_(.+)$/);
	return match ? match[1] : null;
}

class NativeVideoTileManager extends Store {
	private _tracks: Readonly<Record<string, NativeInboundVideoTrack>> = {};
	private entries = new Map<string, NativeVideoEntry>();
	private retainedLastFrames = new Map<string, NativeRetainedVideoFrame>();
	private unsubscribeFrames: (() => void) | null = null;
	private onFrame: ((frame: VoiceEngineV2BridgeVideoFrame) => void) | null = null;
	private unknownTrackFrameCount = 0;
	private unknownTrackWarnedSids = new Set<string>();
	private observerFailureCount = 0;
	private readonly autoRegisterSuppressedTrackSids = new Set<string>();

	get tracks(): Readonly<Record<string, NativeInboundVideoTrack>> {
		return this._tracks;
	}

	get isFrameSubscriptionActive(): boolean {
		return this.unsubscribeFrames !== null;
	}

	getRetainedLastFrame(trackSid: string): NativeRetainedVideoFrame | undefined {
		return this.retainedLastFrames.get(trackSid);
	}

	get retainedLastFrameCount(): number {
		return this.retainedLastFrames.size;
	}

	private retainLastFrame(frame: VoiceEngineV2BridgeVideoFrame): void {
		const trackSid = frame.meta.trackSid;
		if (this.retainedLastFrames.has(trackSid)) {
			this.retainedLastFrames.delete(trackSid);
		}
		this.retainedLastFrames.set(trackSid, {
			trackSid,
			width: frame.meta.width,
			height: frame.meta.height,
			timestampUs: frame.meta.timestampUs,
			data: frame.data,
		});
		while (this.retainedLastFrames.size > NATIVE_RETAINED_LAST_FRAMES_MAX) {
			const oldestTrackSid = this.retainedLastFrames.keys().next().value;
			if (oldestTrackSid === undefined) break;
			this.retainedLastFrames.delete(oldestTrackSid);
		}
		assert.ok(this.retainedLastFrames.size >= 1, 'retained frame map must contain the frame just retained');
		assert.ok(
			this.retainedLastFrames.size <= NATIVE_RETAINED_LAST_FRAMES_MAX,
			'retained frame map must stay within cap',
		);
	}

	getTracksForParticipant(participantSid: string, participantIdentity?: string): Array<NativeInboundVideoTrack> {
		const tracks: Array<NativeInboundVideoTrack> = [];
		for (const trackSid in this._tracks) {
			const track = this._tracks[trackSid];
			if (!track) continue;
			if (track.participantSid === participantSid) {
				tracks.push(track);
				continue;
			}
			if (participantIdentity !== undefined && track.participantIdentity === participantIdentity) {
				tracks.push(track);
			}
		}
		return tracks;
	}

	start(bridge: VoiceEngineV2BridgeApi, options: NativeVideoTileManagerStartOptions = {}): void {
		this.stopFrameSubscription();
		this.resetFrameDiagnostics();
		this.onFrame = options.onFrame ?? null;
		this.unsubscribeFrames = bridge.onVideoFrame((frame) => this.handleFrame(frame));
		logger.info('Inbound video manager started');
	}

	registerTrack(participantSid: string, trackSid: string, source: string, participantIdentity?: string): void {
		assertNonEmptyString(participantSid, 'participantSid');
		assertNonEmptyString(trackSid, 'trackSid');
		assertNonEmptyString(source, 'source');
		assertOptionalNonEmptyString(participantIdentity, 'participantIdentity');
		const existing = this.entries.get(trackSid);
		if (existing) {
			const conflicting =
				existing.participantSid !== participantSid ||
				existing.participantIdentity !== participantIdentity ||
				existing.source !== source;
			if (conflicting) {
				logger.error('Conflicting re-registration for existing inbound video track; keeping existing entry', {
					trackSid,
					existingParticipantSid: existing.participantSid,
					existingParticipantIdentity: existing.participantIdentity,
					existingSource: existing.source,
					requestedParticipantSid: participantSid,
					requestedParticipantIdentity: participantIdentity,
					requestedSource: source,
				});
			}
			return;
		}
		if (!this.hasTrackCapacity('registerTrack', participantSid, trackSid, source)) {
			return;
		}
		const bridge = createInboundVideoBridge(`${participantSid}:${trackSid}`);
		if (!bridge) {
			this.reportBridgeUnavailable(participantSid, trackSid, source);
			return;
		}
		const entry: NativeVideoEntry = {
			participantSid,
			participantIdentity,
			trackSid,
			source,
			pushFrame: bridge.pushFrame,
			cleanup: () => bridge.cleanup(),
		};
		this.forgetSuppressedAutoRegisterTrack(trackSid);
		this.entries.set(trackSid, entry);
		this.update(() => {
			this._tracks = {
				...this._tracks,
				[trackSid]: {
					participantSid,
					participantIdentity,
					trackSid,
					source,
					width: 0,
					height: 0,
					stream: bridge.stream,
				},
			};
		});
		logger.debug('Registered inbound video track', {participantSid, participantIdentity, trackSid, source});
	}

	private hasTrackCapacity(operation: string, participantSid: string, trackSid: string, source: string): boolean {
		assert.ok(this.entries.size <= NATIVE_INBOUND_VIDEO_TRACKS_MAX, 'tracked entries must stay within cap');
		if (this.entries.size < NATIVE_INBOUND_VIDEO_TRACKS_MAX) {
			return true;
		}
		logger.error('Refusing inbound video track registration beyond cap; a stale entry may have leaked', {
			operation,
			participantSid,
			trackSid,
			source,
			trackedCount: this.entries.size,
			cap: NATIVE_INBOUND_VIDEO_TRACKS_MAX,
		});
		return false;
	}

	private reportBridgeUnavailable(participantSid: string, trackSid: string, source: string): void {
		if (isVoiceScreenShareSource(source)) {
			logger.warn('Could not build inbound video bridge; tile will be unavailable', {participantSid, trackSid});
			ScreenShareWatchFailures.reportFailure({
				participantSid,
				trackSid,
				source: VoiceTrackSource.ScreenShare,
				code: ScreenShareWatchErrorCode.NativeInboundBridgeUnavailable,
				reason: 'native-inbound-bridge-unavailable',
			});
			return;
		}
		logger.error('Could not build inbound camera video bridge; camera tile will be unavailable', {
			participantSid,
			trackSid,
			source,
		});
	}

	registerLocalPreviewTrack({
		participantSid,
		participantIdentity,
		trackSid,
		source,
		width,
		height,
		stream,
		cleanup,
	}: {
		participantSid: string;
		participantIdentity?: string;
		trackSid: string;
		source: string;
		width: number;
		height: number;
		stream: MediaStream;
		cleanup: () => Promise<void>;
	}): void {
		assertNonEmptyString(participantSid, 'participantSid');
		assertNonEmptyString(trackSid, 'trackSid');
		assertNonEmptyString(source, 'source');
		assertOptionalNonEmptyString(participantIdentity, 'participantIdentity');
		this.unregisterTrack(trackSid);
		if (!this.hasTrackCapacity('registerLocalPreviewTrack', participantSid, trackSid, source)) {
			void cleanup().catch((error) => {
				logger.warn('Failed to clean up refused local preview track', {trackSid, error});
			});
			return;
		}
		const entry: NativeVideoEntry = {participantSid, participantIdentity, trackSid, source, cleanup};
		this.forgetSuppressedAutoRegisterTrack(trackSid);
		this.entries.set(trackSid, entry);
		this.update(() => {
			this._tracks = {
				...this._tracks,
				[trackSid]: {
					participantSid,
					participantIdentity,
					trackSid,
					source,
					width,
					height,
					stream,
				},
			};
		});
		logger.debug('Registered local native preview track', {
			participantSid,
			participantIdentity,
			trackSid,
			source,
			width,
			height,
		});
	}

	unregisterTrack(trackSid: string): void {
		const entry = this.entries.get(trackSid);
		if (!entry) return;
		this.entries.delete(trackSid);
		this.rememberSuppressedAutoRegisterTrack(trackSid);
		this.retainedLastFrames.delete(trackSid);
		void entry.cleanup().catch((error) => {
			logger.warn('Failed to clean up inbound video bridge', {trackSid, error});
		});
		this.update(() => {
			if (!(trackSid in this._tracks)) return;
			const next = {...this._tracks};
			delete next[trackSid];
			this._tracks = next;
		});
		logger.debug('Unregistered inbound video track', {trackSid});
	}

	unregisterParticipant(participantSid: string): void {
		for (const entry of [...this.entries.values()]) {
			if (entry.participantSid === participantSid) {
				this.unregisterTrack(entry.trackSid);
			}
		}
	}

	unregisterConnection(connectionId: string): Array<string> {
		assertNonEmptyString(connectionId, 'connectionId');
		const trackSids: Array<string> = [];
		for (const entry of [...this.entries.values()]) {
			const identityConnectionId = extractParticipantConnectionId(entry.participantIdentity);
			if (identityConnectionId === connectionId) {
				trackSids.push(entry.trackSid);
				continue;
			}
			const sidConnectionId = extractParticipantConnectionId(entry.participantSid);
			if (sidConnectionId === connectionId) {
				trackSids.push(entry.trackSid);
			}
		}
		for (const trackSid of trackSids) {
			this.unregisterTrack(trackSid);
		}
		return trackSids;
	}

	clear(): void {
		this.stopFrameSubscription();
		this.resetFrameDiagnostics();
		for (const entry of [...this.entries.values()]) {
			this.unregisterTrack(entry.trackSid);
		}
		this.retainedLastFrames.clear();
		assert.equal(this.entries.size, 0, 'tracked entries must be empty after clear');
		assert.equal(this.retainedLastFrames.size, 0, 'retained frames must be empty after clear');
	}

	private rememberSuppressedAutoRegisterTrack(trackSid: string): void {
		assertNonEmptyString(trackSid, 'auto-register suppressed trackSid');
		if (this.autoRegisterSuppressedTrackSids.has(trackSid)) {
			this.autoRegisterSuppressedTrackSids.delete(trackSid);
		}
		while (this.autoRegisterSuppressedTrackSids.size >= NATIVE_AUTO_REGISTER_SUPPRESSED_TRACKS_MAX) {
			const oldestTrackSid = this.autoRegisterSuppressedTrackSids.keys().next().value;
			if (oldestTrackSid === undefined) break;
			this.autoRegisterSuppressedTrackSids.delete(oldestTrackSid);
		}
		this.autoRegisterSuppressedTrackSids.add(trackSid);
		assert.ok(
			this.autoRegisterSuppressedTrackSids.size <= NATIVE_AUTO_REGISTER_SUPPRESSED_TRACKS_MAX,
			'auto-register suppression set must stay within cap',
		);
	}

	private forgetSuppressedAutoRegisterTrack(trackSid: string): void {
		assertNonEmptyString(trackSid, 'auto-register resumed trackSid');
		this.autoRegisterSuppressedTrackSids.delete(trackSid);
		assert.ok(
			this.autoRegisterSuppressedTrackSids.size <= NATIVE_AUTO_REGISTER_SUPPRESSED_TRACKS_MAX,
			'auto-register suppression set must stay within cap after delete',
		);
	}

	private stopFrameSubscription(): void {
		this.unsubscribeFrames?.();
		this.unsubscribeFrames = null;
		this.onFrame = null;
	}

	private resetFrameDiagnostics(): void {
		this.unknownTrackFrameCount = 0;
		this.unknownTrackWarnedSids.clear();
		this.observerFailureCount = 0;
		this.autoRegisterSuppressedTrackSids.clear();
		assert.equal(this.unknownTrackWarnedSids.size, 0, 'unknown-track warn latch must be empty after reset');
		assert.equal(this.observerFailureCount, 0, 'observer failure count must be zero after reset');
		assert.equal(this.autoRegisterSuppressedTrackSids.size, 0, 'auto-register suppression set must reset');
	}

	private noteObserverFailure(error: unknown): void {
		this.observerFailureCount = Math.min(this.observerFailureCount + 1, OBSERVER_FAILURE_COUNT_MAX);
		assert.ok(this.observerFailureCount >= 1, 'observer failure count must advance');
		assert.ok(this.observerFailureCount <= OBSERVER_FAILURE_COUNT_MAX, 'observer failure count must stay bounded');
		const shouldLog =
			this.observerFailureCount === 1 || this.observerFailureCount % OBSERVER_FAILURE_LOG_INTERVAL === 0;
		if (shouldLog) {
			logger.warn('Inbound video frame observer failed', {failureCount: this.observerFailureCount, error});
		}
	}

	private noteUnknownTrackFrame(trackSid: string): void {
		this.unknownTrackFrameCount = Math.min(this.unknownTrackFrameCount + 1, UNKNOWN_TRACK_FRAME_COUNT_MAX);
		assert.ok(this.unknownTrackFrameCount >= 1, 'unknown-track frame count must advance');
		assert.ok(this.unknownTrackFrameCount <= UNKNOWN_TRACK_FRAME_COUNT_MAX, 'unknown-track count must stay bounded');
		if (this.unknownTrackWarnedSids.has(trackSid)) {
			return;
		}
		if (this.unknownTrackWarnedSids.size >= UNKNOWN_TRACK_WARNED_SIDS_MAX) {
			return;
		}
		this.unknownTrackWarnedSids.add(trackSid);
		logger.warn('Dropping inbound video frames for unregistered track', {
			trackSid,
			droppedFrameCount: this.unknownTrackFrameCount,
			registeredTrackCount: this.entries.size,
		});
	}

	private registerCameraTrackFromFrame(frame: VoiceEngineV2BridgeVideoFrame): NativeVideoEntry | null {
		const meta = frame.meta as NativeVideoFrameMetaWithSource;
		const source = asVoiceTrackSource(meta.source);
		if (source !== VoiceTrackSource.Camera) return null;
		if (typeof meta.participantSid !== 'string' || meta.participantSid.length === 0) return null;
		if (typeof meta.trackSid !== 'string' || meta.trackSid.length === 0) return null;
		if (this.autoRegisterSuppressedTrackSids.has(meta.trackSid)) return null;
		const participantIdentity =
			typeof meta.participantIdentity === 'string' && meta.participantIdentity.length > 0
				? meta.participantIdentity
				: typeof meta.identity === 'string' && meta.identity.length > 0
					? meta.identity
					: undefined;
		this.registerTrack(meta.participantSid, meta.trackSid, source, participantIdentity);
		return this.entries.get(meta.trackSid) ?? null;
	}

	private handleFrame(frame: VoiceEngineV2BridgeVideoFrame): void {
		try {
			this.onFrame?.(frame);
		} catch (error) {
			this.noteObserverFailure(error);
		}
		const key = frameKey(frame);
		const entry = this.entries.get(key) ?? this.registerCameraTrackFromFrame(frame);
		if (!entry) {
			this.noteUnknownTrackFrame(key);
			return;
		}
		entry.pushFrame?.({
			width: frame.meta.width,
			height: frame.meta.height,
			timestampUs: frame.meta.timestampUs,
			data: frame.data,
		});
		this.retainLastFrame(frame);
		const existing = this._tracks[key];
		if (existing && (existing.width !== frame.meta.width || existing.height !== frame.meta.height)) {
			this.update(() => {
				this._tracks = {
					...this._tracks,
					[key]: {...existing, width: frame.meta.width, height: frame.meta.height},
				};
			});
		}
	}
}

const instance = new NativeVideoTileManager();

(
	window as typeof window & {
		_nativeVideoTileManager?: NativeVideoTileManager;
	}
)._nativeVideoTileManager = instance;

export default instance;
export {NativeVideoTileManager};
