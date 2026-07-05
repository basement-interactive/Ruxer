// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';
import {Logger} from '@app/features/platform/utils/AppLogger';
import {
	type NativeAudioDeviceModuleStatus,
	nativeAudioDeviceModuleState,
} from '@app/features/voice/engine/native_voice_engine/NativeAudioDeviceModuleState';
import {getNativeVoiceEngineConnectionEventAction} from '@app/features/voice/engine/native_voice_engine/nativeVoiceEngineEventMapper';
import type {VoiceEngine} from '@app/features/voice/engine/native_voice_engine/VoiceEngine';
import {
	createVoiceEngineV2OperationFailure,
	VOICE_ENGINE_V2_CAMERA_EFFECT_STRENGTH_MAX,
	VOICE_ENGINE_V2_CAMERA_EFFECT_STRENGTH_MIN,
	VOICE_ENGINE_V2_OPERATION_SUCCESS,
	type VoiceEngineV2BridgeApi,
	type VoiceEngineV2BridgeAudioInputDevice,
	type VoiceEngineV2BridgeAudioOutputDevice,
	type VoiceEngineV2BridgeCameraDevice,
	type VoiceEngineV2BridgeCameraPreviewInfo,
	type VoiceEngineV2BridgeCapabilities,
	type VoiceEngineV2BridgeConnectOptions,
	type VoiceEngineV2BridgeEvent,
	type VoiceEngineV2BridgeOperationResult,
	type VoiceEngineV2BridgePcmFrame,
	type VoiceEngineV2BridgeProcessedCameraFrame,
	type VoiceEngineV2BridgePublishCameraOptions,
	type VoiceEngineV2BridgePublishDataOptions,
	type VoiceEngineV2BridgePublishDeviceScreenShareOptions,
	type VoiceEngineV2BridgePublishMicrophoneOptions,
	type VoiceEngineV2BridgePublishNativeCameraSinkResult,
	type VoiceEngineV2BridgePublishProcessedCameraOptions,
	type VoiceEngineV2BridgePublishProcessedCameraResult,
	type VoiceEngineV2BridgePublishScreenAudioOptions,
	type VoiceEngineV2BridgePublishScreenOptions,
	type VoiceEngineV2BridgeRemoteTrackSubscriptionOptions,
	type VoiceEngineV2BridgeSpeakingDetectionOptions,
	type VoiceEngineV2BridgeStartCameraPreviewOptions,
	type VoiceEngineV2BridgeStats,
	type VoiceEngineV2BridgeUpdateCameraCaptureOptions,
	type VoiceEngineV2BridgeUpdateScreenShareEncodingOptions,
} from '@fluxer/voice_engine_v2/bridge';

const logger = new Logger('NativeVoiceEngine');

const PCM_FRAME_CHANNELS_MIN = 1;
const PCM_FRAME_CHANNELS_MAX = 8;

function assertCameraEffectStrengthInvariant(value: number, field: string, operation: string): void {
	assert.ok(Number.isInteger(value), `${operation} ${field} must be an integer`);
	assert.ok(value >= VOICE_ENGINE_V2_CAMERA_EFFECT_STRENGTH_MIN, `${operation} ${field} must be at least 0`);
	assert.ok(value <= VOICE_ENGINE_V2_CAMERA_EFFECT_STRENGTH_MAX, `${operation} ${field} must be at most 100`);
}

function assertCameraOptionInvariants(params: VoiceEngineV2BridgePublishCameraOptions, operation: string): void {
	if (params.width != null) {
		assert.ok(Number.isFinite(params.width), `${operation} width must be finite`);
		assert.ok(params.width > 0, `${operation} width must be positive`);
	}
	if (params.height != null) {
		assert.ok(Number.isFinite(params.height), `${operation} height must be finite`);
		assert.ok(params.height > 0, `${operation} height must be positive`);
	}
	if (params.frameRate != null) {
		assert.ok(Number.isFinite(params.frameRate), `${operation} frameRate must be finite`);
		assert.ok(params.frameRate > 0, `${operation} frameRate must be positive`);
	}
	if (params.backgroundBlurStrength != null) {
		assertCameraEffectStrengthInvariant(params.backgroundBlurStrength, 'backgroundBlurStrength', operation);
	}
}

export function floatToPcm16Buffer(channelData: Float32Array): ArrayBuffer {
	const buffer = new ArrayBuffer(channelData.length * 2);
	const view = new Uint8Array(buffer);
	for (let i = 0; i < channelData.length; i++) {
		const clamped = Math.max(-1, Math.min(1, channelData[i] ?? 0));
		const pcm = (clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff) | 0;
		const byteOffset = i * 2;
		view[byteOffset] = pcm & 0xff;
		view[byteOffset + 1] = (pcm >> 8) & 0xff;
	}
	return buffer;
}

function toOwnedArrayBuffer(payload: ArrayBuffer | ArrayBufferView): ArrayBuffer {
	if (payload instanceof ArrayBuffer) return payload.slice(0);
	const copy = new Uint8Array(payload.byteLength);
	copy.set(new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength));
	return copy.buffer;
}

function createNativeMicrophoneNotConnectedResult(): VoiceEngineV2BridgeOperationResult {
	return createVoiceEngineV2OperationFailure({
		code: 'not-connected',
		capability: 'microphoneCapture',
		message: 'Native voice engine is not connected',
	});
}

function isNativeAudioDeviceModuleReadyForMicrophone(status: NativeAudioDeviceModuleStatus): boolean {
	assert.equal(typeof status, 'string', 'native audio device module status must be a string');
	return status === 'ready' || status === 'unsupported';
}

function createNativeMicrophoneAudioDeviceModuleNotReadyResult(
	status: NativeAudioDeviceModuleStatus,
): VoiceEngineV2BridgeOperationResult {
	assert.equal(typeof status, 'string', 'native audio device module status must be a string');
	return createVoiceEngineV2OperationFailure({
		code: 'native-error',
		capability: 'microphoneCapture',
		message: `Native audio device module is ${status}`,
	});
}

function isCameraAlreadyPublishedError(error: unknown): boolean {
	return error instanceof Error && /camera already published/i.test(error.message);
}

type NativeVoiceEngineScreenShareVideoPublication =
	| {
			readonly kind: 'display';
			readonly configKey: string;
			readonly options: VoiceEngineV2BridgePublishScreenOptions;
	  }
	| {
			readonly kind: 'device';
			readonly configKey: string;
	  };

type NativeVoiceEngineScreenShareVideoState =
	| {
			readonly kind: 'idle';
	  }
	| {
			readonly kind: 'publishing';
			readonly target: NativeVoiceEngineScreenShareVideoPublication;
			readonly promise: Promise<void>;
	  }
	| {
			readonly kind: 'published';
			readonly publication: NativeVoiceEngineScreenShareVideoPublication;
	  };

type NativeVoiceEngineScreenShareAudioState =
	| {
			readonly kind: 'idle';
	  }
	| {
			readonly kind: 'published';
			readonly configKey: string;
	  };

export class NativeVoiceEngine implements VoiceEngine {
	readonly kind = 'native' as const;
	private readonly bridge: VoiceEngineV2BridgeApi;
	private connected = false;
	private connectionOperationGeneration = 0;
	private prewarmPromise: Promise<void> | null = null;
	private microphonePublished = false;
	private microphoneConfigKey: string | null = null;
	private cameraPublished = false;
	private cameraConfigKey: string | null = null;
	private cameraTrackSid: string | null = null;
	private cameraPublishInFlight: Promise<unknown> | null = null;
	private cameraPublishInFlightKey: string | null = null;
	private screenShareVideoState: NativeVoiceEngineScreenShareVideoState = {kind: 'idle'};
	private screenShareAudioState: NativeVoiceEngineScreenShareAudioState = {kind: 'idle'};

	constructor(bridge: VoiceEngineV2BridgeApi) {
		this.bridge = bridge;
	}

	async getCapabilities(): Promise<VoiceEngineV2BridgeCapabilities> {
		return this.bridge.getCapabilities();
	}

	private async runPrewarm(): Promise<void> {
		logger.info('Native voice engine prewarm requested');
		await this.bridge.prewarm();
		logger.info('Native voice engine prewarm acknowledged');
	}

	async prewarm(): Promise<void> {
		if (!this.prewarmPromise) {
			this.prewarmPromise = this.runPrewarm().finally(() => {
				this.prewarmPromise = null;
			});
		}
		return this.prewarmPromise;
	}

	async connect(params: VoiceEngineV2BridgeConnectOptions): Promise<void> {
		const generation = ++this.connectionOperationGeneration;
		logger.info('Native voice engine connect requested', {hasE2EE: params.e2eeKey != null});
		await this.prewarm();
		if (generation !== this.connectionOperationGeneration) {
			logger.warn('Skipping stale native voice engine connect after prewarm', {hasE2EE: params.e2eeKey != null});
			return;
		}
		await this.bridge.connect(params);
		if (generation !== this.connectionOperationGeneration) {
			logger.warn('Ignoring stale native voice engine connect acknowledgement', {hasE2EE: params.e2eeKey != null});
			return;
		}
		this.connected = true;
		logger.info('Native voice engine connect acknowledged', {hasE2EE: params.e2eeKey != null});
	}

	async disconnect(): Promise<void> {
		this.connectionOperationGeneration++;
		this.connected = false;
		this.clearPublishedMediaState();
		await this.bridge.disconnect();
	}

	private clearPublishedMediaState(): void {
		this.microphonePublished = false;
		this.microphoneConfigKey = null;
		this.cameraPublished = false;
		this.cameraConfigKey = null;
		this.cameraTrackSid = null;
		this.cameraPublishInFlight = null;
		this.cameraPublishInFlightKey = null;
		this.clearScreenShareVideoState();
		this.clearScreenShareAudioState();
	}

	isConnected(): boolean {
		return this.connected;
	}

	isPublishingCamera(): boolean {
		return this.cameraPublished || this.cameraPublishInFlight !== null;
	}

	async publishMicrophone(
		params: VoiceEngineV2BridgePublishMicrophoneOptions = {},
	): Promise<VoiceEngineV2BridgeOperationResult> {
		const capabilities = await this.getCapabilities();
		if (!capabilities.microphoneCapture) {
			this.microphonePublished = false;
			this.microphoneConfigKey = null;
			return createVoiceEngineV2OperationFailure({
				code: 'unsupported-capability',
				capability: 'microphoneCapture',
				message: 'Native voice engine addon does not support device microphone capture',
			});
		}
		if (!this.connected) {
			this.microphonePublished = false;
			this.microphoneConfigKey = null;
			return createNativeMicrophoneNotConnectedResult();
		}
		const audioDeviceModuleStatus = await nativeAudioDeviceModuleState.ensureStatus();
		if (!isNativeAudioDeviceModuleReadyForMicrophone(audioDeviceModuleStatus)) {
			this.microphonePublished = false;
			this.microphoneConfigKey = null;
			return createNativeMicrophoneAudioDeviceModuleNotReadyResult(audioDeviceModuleStatus);
		}
		const requestedDeviceId = params.deviceId?.trim() || null;
		const publishOptions = {
			deviceId: requestedDeviceId ?? undefined,
			echoCancellation: params.echoCancellation,
			noiseSuppression: params.noiseSuppression,
			autoGainControl: params.autoGainControl,
			deepFilter: params.deepFilter,
			deepFilterNoiseReductionLevel: params.deepFilterNoiseReductionLevel,
			maxBitrateBps: params.maxBitrateBps,
		};
		const configKey = JSON.stringify(publishOptions);
		if (this.microphonePublished && this.microphoneConfigKey === configKey) return VOICE_ENGINE_V2_OPERATION_SUCCESS;
		const result = await this.bridge.publishMicrophone(publishOptions);
		if (!result.ok) {
			this.microphonePublished = false;
			this.microphoneConfigKey = null;
			return result;
		}
		this.microphonePublished = true;
		this.microphoneConfigKey = configKey;
		logger.info('Native voice engine microphone publish requested', {
			hasDeviceId: requestedDeviceId != null,
		});
		return result;
	}

	private async waitForInFlightPublish(inFlight: Promise<unknown>, operation: string): Promise<void> {
		try {
			await inFlight;
		} catch (error) {
			logger.warn('Native voice engine in-flight publish failed while being awaited', {operation, error});
		}
	}

	private getCameraPublishOptionsConfigKey(params: VoiceEngineV2BridgePublishCameraOptions): string {
		return JSON.stringify({
			deviceId: params.deviceId,
			width: params.width,
			height: params.height,
			frameRate: params.frameRate,
			mirror: params.mirror,
			backgroundMode: params.backgroundMode,
			backgroundCustomMediaPath: params.backgroundCustomMediaPath,
			backgroundCustomMediaKind: params.backgroundCustomMediaKind,
			backgroundBlurStrength: params.backgroundBlurStrength,
		});
	}

	private buildCameraCaptureOptions(
		params: VoiceEngineV2BridgePublishCameraOptions,
	): VoiceEngineV2BridgePublishCameraOptions {
		return {
			deviceId: params.deviceId,
			width: params.width,
			height: params.height,
			frameRate: params.frameRate,
			...(params.mirror != null ? {mirror: params.mirror} : {}),
			...(params.backgroundMode ? {backgroundMode: params.backgroundMode} : {}),
			...(params.backgroundCustomMediaPath ? {backgroundCustomMediaPath: params.backgroundCustomMediaPath} : {}),
			...(params.backgroundCustomMediaKind ? {backgroundCustomMediaKind: params.backgroundCustomMediaKind} : {}),
			...(params.backgroundBlurStrength != null ? {backgroundBlurStrength: params.backgroundBlurStrength} : {}),
		};
	}

	private getScreenShareAudioConfigKey(params: VoiceEngineV2BridgePublishScreenAudioOptions): string {
		return JSON.stringify({
			sampleRate: params.sampleRate,
			numChannels: params.numChannels,
			route: params.route,
			captureId: params.captureId,
			tapId: params.tapId,
		});
	}

	private getScreenSharePublishOptionsConfigKey(params: VoiceEngineV2BridgePublishScreenOptions): string {
		return JSON.stringify({
			captureId: params.captureId,
			width: params.width,
			height: params.height,
			codec: params.codec,
			maxBitrateBps: params.maxBitrateBps,
			maxFramerate: params.maxFramerate,
			adaptiveSend: params.adaptiveSend,
			minVideoFps: params.minVideoFps,
			maxAudioBufferMs: params.maxAudioBufferMs,
			pacing: params.pacing,
			trackName: params.trackName,
		});
	}

	private getPublishedScreenShareVideo(): NativeVoiceEngineScreenShareVideoPublication | null {
		return this.screenShareVideoState.kind === 'published' ? this.screenShareVideoState.publication : null;
	}

	private getPublishingScreenShareVideo(): Extract<
		NativeVoiceEngineScreenShareVideoState,
		{kind: 'publishing'}
	> | null {
		return this.screenShareVideoState.kind === 'publishing' ? this.screenShareVideoState : null;
	}

	private clearScreenShareVideoState(): void {
		this.screenShareVideoState = {kind: 'idle'};
	}

	private clearScreenShareAudioState(): void {
		this.screenShareAudioState = {kind: 'idle'};
	}

	private isPublishedScreenShareVideoConfig(configKey: string): boolean {
		assert.ok(configKey.length > 0, 'screen-share video config key must be non-empty');
		const publication = this.getPublishedScreenShareVideo();
		return publication?.configKey === configKey;
	}

	private canUpdateScreenShareInPlace(
		previous: VoiceEngineV2BridgePublishScreenOptions,
		next: VoiceEngineV2BridgePublishScreenOptions,
	): boolean {
		return (
			previous.captureId === next.captureId &&
			(previous.codec ?? '') === (next.codec ?? '') &&
			previous.adaptiveSend === next.adaptiveSend &&
			previous.minVideoFps === next.minVideoFps &&
			previous.maxAudioBufferMs === next.maxAudioBufferMs &&
			previous.pacing === next.pacing &&
			previous.trackName === next.trackName
		);
	}

	async publishScreenShare(params: VoiceEngineV2BridgePublishScreenOptions): Promise<void> {
		assert.ok(params.captureId.length > 0, 'screen-share publish captureId must be non-empty');
		assert.ok(Number.isFinite(params.width), 'screen-share publish width must be finite');
		assert.ok(params.width > 0, 'screen-share publish width must be positive');
		assert.ok(Number.isFinite(params.height), 'screen-share publish height must be finite');
		assert.ok(params.height > 0, 'screen-share publish height must be positive');
		if (params.codec != null) {
			assert.ok(params.codec.length > 0, 'screen-share publish codec must be non-empty');
		}
		const configKey = this.getScreenSharePublishOptionsConfigKey(params);
		const target: NativeVoiceEngineScreenShareVideoPublication = {kind: 'display', configKey, options: params};
		if (this.isPublishedScreenShareVideoConfig(configKey)) return;
		const publishing = this.getPublishingScreenShareVideo();
		if (publishing) {
			if (publishing.target.configKey === configKey) {
				return publishing.promise;
			}
			await this.waitForInFlightPublish(publishing.promise, 'publishScreenShare');
			if (this.isPublishedScreenShareVideoConfig(configKey)) return;
		}
		const published = this.getPublishedScreenShareVideo();
		if (published?.kind === 'display' && this.canUpdateScreenShareInPlace(published.options, params)) {
			await this.updateScreenShareEncoding({
				captureId: params.captureId,
				width: params.width,
				height: params.height,
				frameRate: params.maxFramerate,
				maxBitrateBps: params.maxBitrateBps,
			});
			return;
		}
		const publish = (async (): Promise<void> => {
			if (this.getPublishedScreenShareVideo()) {
				await this.bridge.unpublishScreen();
				this.clearScreenShareVideoState();
			}
			await this.bridge.publishScreen({
				captureId: params.captureId,
				width: params.width,
				height: params.height,
				codec: params.codec,
				maxBitrateBps: params.maxBitrateBps,
				maxFramerate: params.maxFramerate,
				adaptiveSend: params.adaptiveSend,
				minVideoFps: params.minVideoFps,
				maxAudioBufferMs: params.maxAudioBufferMs,
				pacing: params.pacing,
				...(params.trackName ? {trackName: params.trackName} : {}),
			});
			this.screenShareVideoState = {kind: 'published', publication: target};
			logger.info('Native voice engine screen-share publish requested', {captureId: params.captureId});
		})();
		this.screenShareVideoState = {kind: 'publishing', target, promise: publish};
		try {
			await publish;
		} finally {
			const latest = this.getPublishingScreenShareVideo();
			if (latest?.promise === publish) {
				this.clearScreenShareVideoState();
			}
		}
	}

	async updateScreenShareEncoding(params: VoiceEngineV2BridgeUpdateScreenShareEncodingOptions): Promise<void> {
		assert.ok(params.captureId.length > 0, 'screen-share encoding update captureId must be non-empty');
		const publishing = this.getPublishingScreenShareVideo();
		if (publishing) {
			await this.waitForInFlightPublish(publishing.promise, 'updateScreenShareEncoding');
		}
		const published = this.getPublishedScreenShareVideo();
		if (published?.kind !== 'display') {
			throw new Error('Native screen-share encoding update requires an active display screen share');
		}
		if (published.options.captureId !== params.captureId) {
			throw new Error('Native screen-share encoding update captureId does not match the active display share');
		}
		await this.bridge.updateScreenShareEncoding({
			captureId: params.captureId,
			width: params.width,
			height: params.height,
			frameRate: params.frameRate,
			maxBitrateBps: params.maxBitrateBps,
		});
		const options = {
			...published.options,
			width: params.width,
			height: params.height,
			maxBitrateBps: params.maxBitrateBps ?? published.options.maxBitrateBps,
			maxFramerate: params.frameRate ?? published.options.maxFramerate,
		};
		const configKey = this.getScreenSharePublishOptionsConfigKey(options);
		this.screenShareVideoState = {kind: 'published', publication: {kind: 'display', configKey, options}};
		logger.info('Native voice engine screen-share encoding update requested', {
			captureId: params.captureId,
			width: params.width,
			height: params.height,
			frameRate: params.frameRate,
			maxBitrateBps: params.maxBitrateBps,
		});
	}

	async unpublishScreenShare(): Promise<void> {
		const publishing = this.getPublishingScreenShareVideo();
		if (publishing) {
			await this.waitForInFlightPublish(publishing.promise, 'unpublishScreenShare');
		}
		this.clearScreenShareVideoState();
		this.clearScreenShareAudioState();
		await this.bridge.unpublishScreen();
	}

	async publishScreenShareAudio(params: VoiceEngineV2BridgePublishScreenAudioOptions): Promise<void> {
		const configKey = this.getScreenShareAudioConfigKey(params);
		if (this.screenShareAudioState.kind === 'published' && this.screenShareAudioState.configKey === configKey) return;
		await this.bridge.publishScreenAudio({
			sampleRate: params.sampleRate,
			numChannels: params.numChannels,
		});
		this.screenShareAudioState = {kind: 'published', configKey};
		logger.info('Native voice engine screen-share audio publish requested');
	}

	async pushScreenShareAudioPcm(frame: VoiceEngineV2BridgePcmFrame): Promise<boolean> {
		assert.ok(Number.isFinite(frame.sampleRate), 'pcm frame sampleRate must be finite');
		assert.ok(frame.sampleRate > 0, 'pcm frame sampleRate must be positive');
		assert.ok(frame.numChannels >= PCM_FRAME_CHANNELS_MIN, 'pcm frame must have at least one channel');
		assert.ok(frame.numChannels <= PCM_FRAME_CHANNELS_MAX, 'pcm frame must have at most eight channels');
		assert.ok(frame.samples.byteLength > 0, 'pcm frame samples must be non-empty');
		if (this.screenShareAudioState.kind !== 'published') return false;
		return this.bridge.pushScreenAudioPcm({
			sampleRate: frame.sampleRate,
			numChannels: frame.numChannels,
			samples: frame.samples,
		});
	}

	async unpublishScreenShareAudio(): Promise<void> {
		this.clearScreenShareAudioState();
		await this.bridge.unpublishScreenAudio();
	}

	async setMicEnabled(enabled: boolean): Promise<VoiceEngineV2BridgeOperationResult> {
		if (!this.connected) {
			return enabled ? createNativeMicrophoneNotConnectedResult() : VOICE_ENGINE_V2_OPERATION_SUCCESS;
		}
		if (enabled && !this.microphonePublished) {
			const publishResult = await this.publishMicrophone();
			if (!publishResult.ok) return publishResult;
		}
		const result = await this.bridge.setMicEnabled(enabled);
		if (!result.ok && !enabled) {
			logger.warn('Native voice engine failed to disable microphone', {error: result.error});
		}
		return result;
	}

	async setSpeakingDetection(options: VoiceEngineV2BridgeSpeakingDetectionOptions): Promise<void> {
		assert.ok(Number.isFinite(options.localThresholdRms), 'local speaking threshold must be finite');
		assert.ok(Number.isFinite(options.remoteThresholdRms), 'remote speaking threshold must be finite');
		assert.ok(options.localThresholdRms > 0, 'local speaking threshold must be positive');
		assert.ok(options.remoteThresholdRms > 0, 'remote speaking threshold must be positive');
		await this.bridge.setSpeakingDetection(options);
	}

	async publishCamera(params: VoiceEngineV2BridgePublishCameraOptions): Promise<void> {
		assertCameraOptionInvariants(params, 'camera publish');
		const publishOptions = this.buildCameraCaptureOptions(params);
		const configKey = this.getCameraPublishOptionsConfigKey(params);
		if (this.cameraPublished && this.cameraConfigKey === configKey) return;
		if (this.cameraPublishInFlight) {
			if (this.cameraPublishInFlightKey === configKey) {
				await this.cameraPublishInFlight;
				return;
			}
			await this.waitForInFlightPublish(this.cameraPublishInFlight, 'publishCamera');
			if (this.cameraPublished && this.cameraConfigKey === configKey) return;
		}
		const publish = (async (): Promise<void> => {
			if (this.cameraPublished) {
				await this.bridge.unpublishCamera();
				this.cameraPublished = false;
				this.cameraConfigKey = null;
				this.cameraTrackSid = null;
			}
			try {
				await this.bridge.publishCamera(publishOptions);
				this.cameraTrackSid = null;
			} catch (error) {
				if (!isCameraAlreadyPublishedError(error)) {
					throw error;
				}
				logger.warn('Native voice engine camera was already published; republishing requested camera config');
				this.cameraPublished = true;
				this.cameraConfigKey = null;
				this.cameraTrackSid = null;
				await this.bridge.unpublishCamera();
				this.cameraPublished = false;
				this.cameraConfigKey = null;
				this.cameraTrackSid = null;
				await this.bridge.publishCamera(publishOptions);
				this.cameraTrackSid = null;
			}
			this.cameraPublished = true;
			this.cameraConfigKey = configKey;
			logger.info('Native voice engine camera publish requested', {
				hasDeviceId: params.deviceId != null,
				backgroundMode: params.backgroundMode ?? 'none',
				mirror: params.mirror ?? false,
			});
		})();
		this.cameraPublishInFlight = publish;
		this.cameraPublishInFlightKey = configKey;
		try {
			await publish;
		} finally {
			if (this.cameraPublishInFlight === publish) {
				this.cameraPublishInFlight = null;
				this.cameraPublishInFlightKey = null;
			}
		}
	}

	async updateCameraCapture(params: VoiceEngineV2BridgeUpdateCameraCaptureOptions): Promise<void> {
		assertCameraOptionInvariants(params, 'camera capture update');
		if (this.cameraPublishInFlight) {
			await this.waitForInFlightPublish(this.cameraPublishInFlight, 'updateCameraCapture');
		}
		const updateOptions = this.buildCameraCaptureOptions(params);
		const configKey = this.getCameraPublishOptionsConfigKey(params);
		assert.ok(configKey.length > 0, 'camera capture update config key must be non-empty');
		if (this.cameraPublished && this.cameraConfigKey === configKey) return;
		await this.bridge.updateCameraCapture(updateOptions);
		this.cameraPublished = true;
		this.cameraConfigKey = configKey;
		logger.info('Native voice engine camera capture update requested', {
			hasDeviceId: params.deviceId != null,
			backgroundMode: params.backgroundMode ?? 'none',
			mirror: params.mirror ?? false,
		});
	}

	async publishNativeCameraSink(
		params: VoiceEngineV2BridgePublishCameraOptions,
	): Promise<VoiceEngineV2BridgePublishNativeCameraSinkResult> {
		const result = await this.bridge.publishNativeCameraSink(params);
		this.cameraPublished = true;
		this.cameraConfigKey = `sink:${this.getCameraPublishOptionsConfigKey(params)}`;
		this.cameraTrackSid = result.trackSid;
		return result;
	}

	async publishProcessedCamera(
		params: VoiceEngineV2BridgePublishProcessedCameraOptions,
	): Promise<VoiceEngineV2BridgePublishProcessedCameraResult> {
		const publishOptions = {
			width: params.width,
			height: params.height,
			frameRate: params.frameRate,
		};
		const configKey = `processed:${JSON.stringify(publishOptions)}`;
		if (this.cameraPublished && this.cameraConfigKey === configKey && this.cameraTrackSid) {
			return {trackSid: this.cameraTrackSid};
		}
		if (this.cameraPublishInFlight) {
			await this.waitForInFlightPublish(this.cameraPublishInFlight, 'publishProcessedCamera');
			if (this.cameraPublished && this.cameraConfigKey === configKey && this.cameraTrackSid) {
				return {trackSid: this.cameraTrackSid};
			}
		}
		const publish = (async (): Promise<VoiceEngineV2BridgePublishProcessedCameraResult> => {
			if (this.cameraPublished) {
				await this.bridge.unpublishCamera();
				this.cameraPublished = false;
				this.cameraConfigKey = null;
				this.cameraTrackSid = null;
			}
			let result: VoiceEngineV2BridgePublishProcessedCameraResult;
			try {
				result = await this.bridge.publishProcessedCamera(publishOptions);
			} catch (error) {
				if (!isCameraAlreadyPublishedError(error)) {
					throw error;
				}
				logger.warn('Native voice engine camera was already published; republishing processed camera config');
				this.cameraPublished = true;
				this.cameraConfigKey = null;
				this.cameraTrackSid = null;
				await this.bridge.unpublishCamera();
				this.cameraPublished = false;
				this.cameraConfigKey = null;
				result = await this.bridge.publishProcessedCamera(publishOptions);
			}
			this.cameraPublished = true;
			this.cameraConfigKey = configKey;
			this.cameraTrackSid = result.trackSid;
			logger.info('Native voice engine processed camera publish requested', {trackSid: result.trackSid});
			return result;
		})();
		this.cameraPublishInFlight = publish;
		this.cameraPublishInFlightKey = configKey;
		try {
			return await publish;
		} finally {
			if (this.cameraPublishInFlight === publish) {
				this.cameraPublishInFlight = null;
				this.cameraPublishInFlightKey = null;
			}
		}
	}

	async pushProcessedCameraFrame(frame: VoiceEngineV2BridgeProcessedCameraFrame): Promise<boolean> {
		if (!this.cameraPublished) return false;
		return this.bridge.pushProcessedCameraFrame(frame);
	}

	async publishDeviceScreenShare(params: VoiceEngineV2BridgePublishDeviceScreenShareOptions): Promise<void> {
		const publishOptions = {
			deviceId: params.deviceId,
			width: params.width,
			height: params.height,
			frameRate: params.frameRate,
			codec: params.codec,
			maxBitrateBps: params.maxBitrateBps,
			maxFramerate: params.maxFramerate,
		};
		const configKey = `device:${JSON.stringify(publishOptions)}`;
		const target: NativeVoiceEngineScreenShareVideoPublication = {kind: 'device', configKey};
		if (this.isPublishedScreenShareVideoConfig(configKey)) return;
		const publishing = this.getPublishingScreenShareVideo();
		if (publishing) {
			if (publishing.target.configKey === configKey) {
				return publishing.promise;
			}
			await this.waitForInFlightPublish(publishing.promise, 'publishDeviceScreenShare');
			if (this.isPublishedScreenShareVideoConfig(configKey)) return;
		}
		const publish = (async (): Promise<void> => {
			if (this.getPublishedScreenShareVideo()) {
				await this.bridge.unpublishScreen();
				this.clearScreenShareVideoState();
			}
			await this.bridge.publishDeviceScreenShare(publishOptions);
			this.screenShareVideoState = {kind: 'published', publication: target};
			logger.info('Native voice engine device screen-share publish requested', {
				hasDeviceId: params.deviceId != null,
			});
		})();
		this.screenShareVideoState = {kind: 'publishing', target, promise: publish};
		try {
			await publish;
		} finally {
			const latest = this.getPublishingScreenShareVideo();
			if (latest?.promise === publish) {
				this.clearScreenShareVideoState();
			}
		}
	}

	async listCameraDevices(): Promise<Array<VoiceEngineV2BridgeCameraDevice>> {
		return this.bridge.listCameraDevices();
	}

	async unpublishCamera(): Promise<void> {
		if (this.cameraPublishInFlight) {
			await this.waitForInFlightPublish(this.cameraPublishInFlight, 'unpublishCamera');
		}
		await this.bridge.unpublishCamera();
		this.cameraPublished = false;
		this.cameraConfigKey = null;
		this.cameraTrackSid = null;
		this.cameraPublishInFlight = null;
		this.cameraPublishInFlightKey = null;
	}

	async startCameraPreview(
		params: VoiceEngineV2BridgeStartCameraPreviewOptions,
	): Promise<VoiceEngineV2BridgeCameraPreviewInfo> {
		assertCameraOptionInvariants(params, 'camera preview');
		const info = await this.bridge.startCameraPreview(params);
		logger.info('Native voice engine camera preview started', {
			trackSid: info.trackSid,
			width: info.width,
			height: info.height,
			backgroundMode: params.backgroundMode ?? 'none',
			mirror: params.mirror ?? false,
		});
		return info;
	}

	async stopCameraPreview(): Promise<void> {
		await this.bridge.stopCameraPreview();
	}

	async listAudioInputDevices(): Promise<Array<VoiceEngineV2BridgeAudioInputDevice>> {
		return this.bridge.listAudioInputDevices();
	}

	async listAudioOutputDevices(): Promise<Array<VoiceEngineV2BridgeAudioOutputDevice>> {
		return this.bridge.listAudioOutputDevices();
	}

	async setAudioOutputDevice(deviceId: string): Promise<void> {
		await this.bridge.setAudioOutputDevice(deviceId);
	}

	async setParticipantVolume(participantSid: string, volume: number): Promise<void> {
		const clamped = Math.max(0, Math.min(2, volume));
		await this.bridge.setParticipantVolume(participantSid, clamped);
	}

	async setRemoteTrackSubscription(params: VoiceEngineV2BridgeRemoteTrackSubscriptionOptions): Promise<void> {
		await this.bridge.setRemoteTrackSubscription(params);
	}

	async publishData(params: VoiceEngineV2BridgePublishDataOptions): Promise<void> {
		await this.bridge.publishData({
			payload: toOwnedArrayBuffer(params.payload),
			reliable: params.reliable,
			topic: params.topic,
			destinationIdentities: params.destinationIdentities,
		});
	}

	async getConnectionStats(): Promise<VoiceEngineV2BridgeStats | null> {
		return this.bridge.getConnectionStats();
	}

	onEvent(listener: (event: VoiceEngineV2BridgeEvent) => void): () => void {
		return this.bridge.onEvent((event: VoiceEngineV2BridgeEvent) => {
			const connectionAction = getNativeVoiceEngineConnectionEventAction(event);
			if (connectionAction === 'connected' || connectionAction === 'reconnected') {
				this.connected = true;
			} else if (connectionAction === 'disconnected') {
				this.connected = false;
				this.clearPublishedMediaState();
			}
			try {
				listener(event);
			} catch (error) {
				logger.error('Native voice engine event listener threw', {type: event.type, error});
			}
		});
	}
}
