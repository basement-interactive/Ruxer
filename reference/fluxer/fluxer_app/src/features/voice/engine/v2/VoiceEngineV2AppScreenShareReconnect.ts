// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';
import type {VoiceScreenShareSourceType} from '@app/features/voice/engine/VoiceScreenShareStateMachine';
import type {VoiceEngineV2AppScreenShareExecutionAdapter} from '@app/features/voice/engine/v2/VoiceEngineV2AppScreenShareExecutionAdapter';
import type {NativeScreenShareOptions} from '@app/features/voice/engine/voice_screen_share_manager/DisplayMediaCapture';
import {logger} from '@app/features/voice/engine/voice_screen_share_manager/shared';
import LocalVoiceState from '@app/features/voice/state/LocalVoiceState';
import type {TrackPublishOptions} from 'livekit-client';

export interface NativeScreenShareReconnectSnapshot {
	nativeOptions: NativeScreenShareOptions;
	publishOptions?: TrackPublishOptions;
	captureId: string | null;
	width: number;
	height: number;
	sourceType: VoiceScreenShareSourceType;
}

export class VoiceEngineV2AppScreenShareReconnect {
	private readonly adapter: VoiceEngineV2AppScreenShareExecutionAdapter;

	constructor(adapter: VoiceEngineV2AppScreenShareExecutionAdapter) {
		this.adapter = adapter;
	}

	prepare(): NativeScreenShareReconnectSnapshot | null {
		const captureCoordinator = this.adapter.captureCoordinator;
		const nativeOptions = captureCoordinator.activeCaptureOptions;
		if (!nativeOptions) return null;
		assert.ok(nativeOptions.source, 'nativeOptions.source required');
		const dimensions = captureCoordinator.activeCaptureDimensions;
		const snapshot: NativeScreenShareReconnectSnapshot = {
			nativeOptions,
			captureId: captureCoordinator.activeCaptureId,
			width: dimensions?.width ?? nativeOptions.source.width,
			height: dimensions?.height ?? nativeOptions.source.height,
			sourceType: this.adapter.getNativeScreenShareSourceType(nativeOptions),
		};
		if (captureCoordinator.activeCapturePublishOptions) {
			snapshot.publishOptions = captureCoordinator.activeCapturePublishOptions;
		}
		assert.ok(snapshot.width > 0, 'snapshot.width must be > 0');
		return snapshot;
	}

	async release(snapshot: NativeScreenShareReconnectSnapshot): Promise<void> {
		assert.ok(snapshot, 'snapshot required');
		assert.ok(snapshot.nativeOptions, 'snapshot.nativeOptions required');
		const captureId = this.adapter.captureCoordinator.activeCaptureId;
		if (snapshot.captureId && captureId && snapshot.captureId !== captureId) {
			logger.debug('Skipping stale native-engine screen-share reconnect release', {
				snapshotCaptureId: snapshot.captureId,
				currentCaptureId: captureId,
			});
			return;
		}
		await this.adapter.releaseNativeEngineScreenShareResourcesInternal({
			reason: 'native-engine-screen-share-reconnect',
			preserveRestoreState: true,
			unpublishRemote: false,
		});
		this.adapter.applyScreenShareStateInternal(true, {reason: 'server', sendUpdate: false});
		this.adapter.syncLocalStreamWatchStateInternal(true);
		this.adapter.transitionScreenShareLifecycleInternal({
			type: 'share.resolve',
			active: true,
			sourceType: snapshot.sourceType,
			encoderVerificationScheduled: false,
			streamingPriorityHeld: this.adapter.streamingPriorityHeld,
		});
	}

	async restore(snapshot: NativeScreenShareReconnectSnapshot): Promise<boolean> {
		assert.ok(snapshot, 'snapshot required');
		assert.ok(snapshot.nativeOptions, 'snapshot.nativeOptions required');
		if (!LocalVoiceState.getSelfStream()) {
			logger.debug('Skipping native-engine screen-share reconnect restore: local stream no longer requested');
			return false;
		}
		if (this.adapter.captureCoordinator.activeCaptureId) {
			await this.release(snapshot);
		}
		try {
			await this.adapter.startNativeEngineScreenShareInternal(
				snapshot.nativeOptions,
				{sendUpdate: false, playSound: false},
				snapshot.publishOptions,
			);
			return LocalVoiceState.getSelfStream();
		} catch (error) {
			logger.warn('Failed to restore native-engine screen share after reconnect', {error});
			return false;
		}
	}
}
