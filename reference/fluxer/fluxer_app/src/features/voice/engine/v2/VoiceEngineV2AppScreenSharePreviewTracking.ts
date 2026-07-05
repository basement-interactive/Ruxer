// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';
import Users from '@app/features/user/state/Users';
import NativeVideoTileManager from '@app/features/voice/engine/native_voice_engine/NativeVideoTileManager';
import {
	getVoiceConnectionContextFromMediaEngine,
	getVoiceEngineV2SnapshotFromMediaEngine,
} from '@app/features/voice/engine/VoiceMediaEngineBridge';
import {VoiceTrackSource} from '@app/features/voice/engine/VoiceTrackSource';
import voiceEngineV2AppConnectionHostAdapter from '@app/features/voice/engine/v2/VoiceEngineV2AppConnectionHostAdapter';
import type {VoiceEngineV2AppScreenShareExecutionAdapter} from '@app/features/voice/engine/v2/VoiceEngineV2AppScreenShareExecutionAdapter';
import {selectVoiceEngineV2AppParticipants} from '@app/features/voice/engine/v2/VoiceEngineV2AppSelectors';
import type {NativeEngineScreenCapture} from '@app/features/voice/engine/voice_screen_share_manager/DisplayMediaCapture';
import {
	type DeviceScreenShareCaptureOptions,
	logger,
} from '@app/features/voice/engine/voice_screen_share_manager/shared';
import {buildVoiceParticipantIdentity} from '@app/features/voice/utils/VoiceParticipantIdentity';
import {createLocalVideoTrack, type LocalVideoTrack} from 'livekit-client';

const NATIVE_SCREEN_SHARE_PREVIEW_RETRY_DELAY_MS = 250;
const NATIVE_SCREEN_SHARE_PREVIEW_MAX_ATTEMPTS = 8;
const NATIVE_SCREEN_SHARE_PREVIEW_READY_TIMEOUT_MS = 2000;

interface NativeScreenSharePreviewParticipant {
	identity: string;
	sid: string;
}

type NativeScreenSharePreviewParticipantCandidate = NativeScreenSharePreviewParticipant & {
	isLocal?: boolean;
};

function delay(ms: number): Promise<void> {
	assert.ok(Number.isFinite(ms) && ms >= 0, 'ms must be non-negative finite');
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export class VoiceEngineV2AppScreenSharePreviewTracking {
	private readonly adapter: VoiceEngineV2AppScreenShareExecutionAdapter;

	constructor(adapter: VoiceEngineV2AppScreenShareExecutionAdapter) {
		this.adapter = adapter;
	}

	registerCapturePreview(capture: NativeEngineScreenCapture): void {
		assert.ok(capture, 'capture required');
		assert.equal(typeof capture.captureId, 'string', 'capture.captureId must be string');
		this.clearPreview();
		const token = this.adapter.nativeEngineScreenSharePreviewStartToken;
		void this.attachCapturePreview(capture, token);
	}

	registerDevicePreview(
		options: DeviceScreenShareCaptureOptions | undefined,
		dimensions: {width: number; height: number; frameRate: number},
	): void {
		assert.ok(dimensions, 'dimensions required');
		assert.ok(dimensions.width > 0, 'dimensions.width must be > 0');
		this.clearPreview();
		const token = this.adapter.nativeEngineScreenSharePreviewStartToken;
		void this.attachDevicePreview(options, dimensions, token);
	}

	clearPreview(): void {
		this.adapter.nativeEngineScreenSharePreviewStartToken++;
		const trackSid = this.adapter.nativeEngineScreenSharePreviewTrackSid;
		this.adapter.nativeEngineScreenSharePreviewTrackSid = null;
		assert.equal(this.adapter.nativeEngineScreenSharePreviewTrackSid, null, 'trackSid must be null after clearPreview');
		if (trackSid) {
			NativeVideoTileManager.unregisterTrack(trackSid);
		}
	}

	private async cleanupUnattachedPreview(capture: NativeEngineScreenCapture, reason: string): Promise<void> {
		await capture.previewBridge.cleanup(false).catch((error) => {
			logger.warn('Failed to clean up unattached native-engine screen-share preview', {
				captureId: capture.captureId,
				reason,
				error,
			});
		});
	}

	private resolveLocalParticipant(): NativeScreenSharePreviewParticipant | null {
		const snapshot = getVoiceEngineV2SnapshotFromMediaEngine();
		const participants: ReadonlyArray<NativeScreenSharePreviewParticipantCandidate> = snapshot
			? selectVoiceEngineV2AppParticipants(snapshot).participants
			: [];
		const connectionId = getVoiceConnectionContextFromMediaEngine()?.connectionId ?? null;
		const currentUserId = Users.getCurrentUser()?.id;
		const fallbackIdentity =
			currentUserId && connectionId ? buildVoiceParticipantIdentity(currentUserId, connectionId) : null;
		const localParticipant =
			participants.find((participant) => participant.isLocal && participant.identity) ??
			(fallbackIdentity ? participants.find((participant) => participant.identity === fallbackIdentity) : undefined);
		if (localParticipant?.identity) {
			return {
				identity: localParticipant.identity,
				sid: localParticipant.sid || localParticipant.identity,
			};
		}
		if (!fallbackIdentity) return null;
		return {
			identity: fallbackIdentity,
			sid: fallbackIdentity,
		};
	}

	private waitForLocalParticipant(token: number): Promise<NativeScreenSharePreviewParticipant | null> {
		assert.ok(Number.isInteger(token), 'token must be an integer');
		assert.ok(token >= 0, 'token must be non-negative');
		const immediate = this.resolveLocalParticipant();
		if (immediate) {
			return Promise.resolve(immediate);
		}
		return new Promise((resolve) => {
			let settled = false;
			let unsubscribe: (() => void) | null = null;
			let timeoutId: NodeJS.Timeout | null = null;
			const settle = (participant: NativeScreenSharePreviewParticipant | null): void => {
				if (settled) return;
				settled = true;
				unsubscribe?.();
				if (timeoutId != null) {
					clearTimeout(timeoutId);
				}
				resolve(participant);
			};
			const check = (): void => {
				if (token !== this.adapter.nativeEngineScreenSharePreviewStartToken) {
					settle(null);
					return;
				}
				const participant = this.resolveLocalParticipant();
				if (participant) {
					settle(participant);
				}
			};
			unsubscribe = voiceEngineV2AppConnectionHostAdapter.subscribe(check);
			timeoutId = setTimeout(
				() => settle(this.resolveLocalParticipant()),
				NATIVE_SCREEN_SHARE_PREVIEW_READY_TIMEOUT_MS,
			);
			check();
		});
	}

	private async attachCapturePreview(capture: NativeEngineScreenCapture, token: number): Promise<void> {
		const localParticipant = await this.waitForLocalParticipant(token);
		if (token !== this.adapter.nativeEngineScreenSharePreviewStartToken) {
			await this.cleanupUnattachedPreview(capture, 'stale-preview-registration');
			return;
		}
		if (!localParticipant?.identity) {
			await this.cleanupUnattachedPreview(capture, 'missing-local-participant');
			logger.warn('Cannot attach native-engine screen-share preview without local participant', {
				captureId: capture.captureId,
			});
			return;
		}
		const trackSid = `native-local-screen:${capture.captureId}`;
		this.adapter.nativeEngineScreenSharePreviewTrackSid = trackSid;
		NativeVideoTileManager.registerLocalPreviewTrack({
			participantSid: localParticipant.sid,
			participantIdentity: localParticipant.identity,
			trackSid,
			source: VoiceTrackSource.ScreenShare,
			width: capture.width,
			height: capture.height,
			stream: new MediaStream([capture.previewBridge.track]),
			cleanup: () => capture.previewBridge.cleanup(false),
		});
	}

	private async attachDevicePreview(
		options: DeviceScreenShareCaptureOptions | undefined,
		dimensions: {width: number; height: number; frameRate: number},
		token: number,
	): Promise<void> {
		const localParticipant = await this.waitForLocalParticipant(token);
		if (token !== this.adapter.nativeEngineScreenSharePreviewStartToken) return;
		if (!localParticipant?.identity) {
			logger.warn('Cannot attach native-engine device screen-share preview without local participant');
			return;
		}
		const track = await this.createDevicePreviewTrack(options, dimensions, token);
		if (!track) return;
		try {
			if (token !== this.adapter.nativeEngineScreenSharePreviewStartToken) {
				track.stop();
				return;
			}
			const settings = track.mediaStreamTrack.getSettings();
			const trackSid = `native-local-device-screen:${localParticipant.identity}`;
			this.adapter.nativeEngineScreenSharePreviewTrackSid = trackSid;
			NativeVideoTileManager.registerLocalPreviewTrack({
				participantSid: localParticipant.sid,
				participantIdentity: localParticipant.identity,
				trackSid,
				source: VoiceTrackSource.ScreenShare,
				width: settings.width ?? dimensions.width,
				height: settings.height ?? dimensions.height,
				stream: new MediaStream([track.mediaStreamTrack]),
				cleanup: async () => {
					track?.stop();
				},
			});
		} catch (error) {
			track.stop();
			logger.warn('Failed to register native-engine device screen-share local preview', {
				error,
				videoDeviceId: options?.previewVideoDeviceId,
			});
		}
	}

	private async createDevicePreviewTrack(
		options: DeviceScreenShareCaptureOptions | undefined,
		dimensions: {width: number; height: number; frameRate: number},
		token: number,
	): Promise<LocalVideoTrack | null> {
		let lastError: unknown;
		for (let attempt = 1; attempt <= NATIVE_SCREEN_SHARE_PREVIEW_MAX_ATTEMPTS; attempt++) {
			if (token !== this.adapter.nativeEngineScreenSharePreviewStartToken) return null;
			try {
				return await createLocalVideoTrack({
					deviceId:
						options?.previewVideoDeviceId && options.previewVideoDeviceId !== 'default'
							? options.previewVideoDeviceId
							: undefined,
					resolution: {
						width: dimensions.width,
						height: dimensions.height,
						frameRate: dimensions.frameRate,
					},
				});
			} catch (error) {
				lastError = error;
				if (attempt >= NATIVE_SCREEN_SHARE_PREVIEW_MAX_ATTEMPTS) break;
				await delay(NATIVE_SCREEN_SHARE_PREVIEW_RETRY_DELAY_MS);
			}
		}
		logger.warn('Failed to create native-engine device screen-share local preview', {
			error: lastError,
			videoDeviceId: options?.previewVideoDeviceId,
			attempts: NATIVE_SCREEN_SHARE_PREVIEW_MAX_ATTEMPTS,
		});
		return null;
	}
}
