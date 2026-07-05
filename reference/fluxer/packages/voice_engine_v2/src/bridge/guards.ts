// SPDX-License-Identifier: AGPL-3.0-or-later

import {assertAudioFrameInvariants, assertSchemaVersion, assertVideoFrameInvariants} from './ffi_assertions';
import type {
	VoiceEngineV2BridgeCameraBackgroundCustomMediaKind,
	VoiceEngineV2BridgeCameraBackgroundMode,
	VoiceEngineV2BridgeCameraPreviewInfo,
	VoiceEngineV2BridgeCapabilities,
	VoiceEngineV2BridgeConnectOptions,
	VoiceEngineV2BridgeFloatPcmFrame,
	VoiceEngineV2BridgeHardwareEncoderCapabilities,
	VoiceEngineV2BridgeParticipantVolumeOptions,
	VoiceEngineV2BridgePcmFrame,
	VoiceEngineV2BridgeProcessedCameraFrame,
	VoiceEngineV2BridgePublishCameraOptions,
	VoiceEngineV2BridgePublishDataOptions,
	VoiceEngineV2BridgePublishDeviceScreenShareOptions,
	VoiceEngineV2BridgePublishMicrophoneOptions,
	VoiceEngineV2BridgePublishProcessedCameraOptions,
	VoiceEngineV2BridgePublishProcessedCameraResult,
	VoiceEngineV2BridgePublishScreenAudioOptions,
	VoiceEngineV2BridgePublishScreenOptions,
	VoiceEngineV2BridgeReadiness,
	VoiceEngineV2BridgeRemoteTrackSubscriptionOptions,
	VoiceEngineV2BridgeRemoteTrackSubscriptionQuality,
	VoiceEngineV2BridgeSpeakingDetectionOptions,
	VoiceEngineV2BridgeUpdateScreenShareEncodingOptions,
} from './types';
import {VOICE_ENGINE_V2_CAMERA_EFFECT_STRENGTH_MAX, VOICE_ENGINE_V2_CAMERA_EFFECT_STRENGTH_MIN} from './types';

export function assertVoiceEngineV2BridgeAudioOptionsInvariants(options: {
	sampleRate: number;
	numChannels: number;
}): void {
	assertAudioFrameInvariants({
		sampleRateHz: options.sampleRate,
		numChannels: options.numChannels,
		frameBytes: 1,
		timestampNs: 1,
	});
}

export function assertVoiceEngineV2BridgeVideoOptionsInvariants(options: {width: number; height: number}): void {
	assertVideoFrameInvariants({
		widthPx: options.width,
		heightPx: options.height,
		frameBytes: 1,
		timestampNs: 1,
	});
}

export function assertVoiceEngineV2BridgeEnvelopeSchema(received: number): void {
	assertSchemaVersion(received);
}

export function unavailableVoiceEngineV2BridgeCapabilities(): VoiceEngineV2BridgeCapabilities {
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
		dataChannel: false,
		connectionStats: false,
		nativeVideoFrames: false,
		hardwareEncoderCapabilities: false,
	};
}

export function normalizeVoiceEngineV2BridgeCapabilities(value: unknown): VoiceEngineV2BridgeCapabilities {
	if (typeof value !== 'object' || value === null) {
		return unavailableVoiceEngineV2BridgeCapabilities();
	}
	const candidate = value as Partial<VoiceEngineV2BridgeCapabilities> & {
		microphone?: boolean;
		camera?: boolean;
		cameraBackgrounds?: boolean;
		screen?: boolean;
		screenAudio?: boolean;
		outputDevice?: boolean;
		dataChannel?: boolean;
		stats?: boolean;
		hardwareEncoding?: boolean;
	};
	return {
		microphoneCapture: candidate.microphoneCapture === true || candidate.microphone === true,
		syntheticMicrophonePcm: candidate.syntheticMicrophonePcm === true,
		cameraCapture: candidate.cameraCapture === true || candidate.camera === true,
		nativeCameraBackgrounds: candidate.nativeCameraBackgrounds === true || candidate.cameraBackgrounds === true,
		screenShare: candidate.screenShare === true || candidate.screen === true,
		screenShareEncodingUpdate: candidate.screenShareEncodingUpdate === true,
		screenShareAudio: candidate.screenShareAudio === true || candidate.screenAudio === true,
		deviceLists: candidate.deviceLists === true,
		outputDeviceSelection: candidate.outputDeviceSelection === true || candidate.outputDevice === true,
		participantVolume: candidate.participantVolume === true,
		remoteTrackSubscription: candidate.remoteTrackSubscription === true,
		dataChannel: candidate.dataChannel === true,
		connectionStats: candidate.connectionStats === true || candidate.stats === true,
		nativeVideoFrames: candidate.nativeVideoFrames === true,
		hardwareEncoderCapabilities: candidate.hardwareEncoderCapabilities === true || candidate.hardwareEncoding === true,
	};
}

export function unavailableVoiceEngineV2BridgeHardwareEncoderCapabilities(
	reason: NonNullable<VoiceEngineV2BridgeHardwareEncoderCapabilities['reason']>,
	detail?: string,
): VoiceEngineV2BridgeHardwareEncoderCapabilities {
	return {
		available: false,
		backend: 'none',
		compiled: false,
		runtime: false,
		codecs: [],
		zeroCopy: false,
		nativeInputs: [],
		reason,
		...(detail ? {detail} : {}),
	};
}

export function normalizeVoiceEngineV2BridgeHardwareEncoderCapabilities(
	value: unknown,
): VoiceEngineV2BridgeHardwareEncoderCapabilities {
	if (typeof value !== 'object' || value === null) {
		return unavailableVoiceEngineV2BridgeHardwareEncoderCapabilities(
			'query-failed',
			'Native addon returned an invalid result',
		);
	}
	const candidate = value as Partial<VoiceEngineV2BridgeHardwareEncoderCapabilities>;
	const backend = typeof candidate.backend === 'string' && candidate.backend.length > 0 ? candidate.backend : 'none';
	return {
		available: candidate.available === true,
		backend,
		compiled: candidate.compiled === true,
		runtime: candidate.runtime === true,
		codecs: Array.isArray(candidate.codecs) ? candidate.codecs.filter((codec) => typeof codec === 'string') : [],
		zeroCopy: candidate.zeroCopy === true,
		nativeInputs: Array.isArray(candidate.nativeInputs)
			? candidate.nativeInputs.filter((input) => typeof input === 'string')
			: [],
		...(typeof candidate.reason === 'string' ? {reason: candidate.reason} : {}),
		...(typeof candidate.detail === 'string' ? {detail: candidate.detail} : {}),
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

function isPositiveFiniteNumber(value: unknown): value is number {
	return isFiniteNumber(value) && value > 0;
}

function isOptionalPositiveFiniteNumber(value: unknown): value is number | undefined {
	return value === undefined || isPositiveFiniteNumber(value);
}

function isOptionalDeepFilterNoiseReductionLevel(value: unknown): value is number | undefined {
	if (value === undefined) return true;
	return isFiniteNumber(value) && value >= 0 && value <= 100;
}

function isOptionalBoolean(value: unknown): value is boolean | undefined {
	return value === undefined || typeof value === 'boolean';
}

function isOptionalString(value: unknown): value is string | undefined {
	return value === undefined || typeof value === 'string';
}

function isOptionalCameraBackgroundMode(value: unknown): value is VoiceEngineV2BridgeCameraBackgroundMode | undefined {
	return value === undefined || value === 'none' || value === 'non' || value === 'blur' || value === 'custom';
}

export function isVoiceEngineV2BridgeCameraEffectStrength(value: unknown): value is number {
	return (
		typeof value === 'number' &&
		Number.isInteger(value) &&
		value >= VOICE_ENGINE_V2_CAMERA_EFFECT_STRENGTH_MIN &&
		value <= VOICE_ENGINE_V2_CAMERA_EFFECT_STRENGTH_MAX
	);
}

function isOptionalCameraEffectStrength(value: unknown): value is number | undefined {
	return value === undefined || isVoiceEngineV2BridgeCameraEffectStrength(value);
}

function isOptionalCameraBackgroundCustomMediaKind(
	value: unknown,
): value is VoiceEngineV2BridgeCameraBackgroundCustomMediaKind | undefined {
	return value === undefined || value === 'static' || value === 'animated' || value === 'video';
}

function isStringArray(value: unknown): value is Array<string> {
	return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isOptionalStringArray(value: unknown): value is Array<string> | undefined {
	return value === undefined || isStringArray(value);
}

function isArrayBuffer(value: unknown): value is ArrayBuffer {
	return value instanceof ArrayBuffer || Object.prototype.toString.call(value) === '[object ArrayBuffer]';
}

function isFloat32Array(value: unknown): value is Float32Array {
	return value instanceof Float32Array || Object.prototype.toString.call(value) === '[object Float32Array]';
}

export function isVoiceEngineV2BridgeBinaryPayload(value: unknown): value is ArrayBuffer | ArrayBufferView {
	return isArrayBuffer(value) || ArrayBuffer.isView(value);
}

export function getVoiceEngineV2BridgeProcessedCameraI420ByteLength(width: number, height: number): number {
	return (width * height * 3) / 2;
}

function isPositiveFiniteInteger(value: unknown): value is number {
	return isPositiveFiniteNumber(value) && Number.isInteger(value);
}

function isPositiveEvenFiniteInteger(value: unknown): value is number {
	return isPositiveFiniteInteger(value) && value % 2 === 0;
}

function getVoiceEngineV2BridgeBinaryPayloadByteLength(value: ArrayBuffer | ArrayBufferView): number {
	return value.byteLength;
}

export function isVoiceEngineV2BridgeRemoteTrackSubscriptionQuality(
	value: unknown,
): value is VoiceEngineV2BridgeRemoteTrackSubscriptionQuality {
	return value === 'low' || value === 'medium' || value === 'high';
}

export function isVoiceEngineV2BridgeConnectOptions(value: unknown): value is VoiceEngineV2BridgeConnectOptions {
	if (!isRecord(value)) return false;
	return (
		typeof value.url === 'string' &&
		value.url.length > 0 &&
		typeof value.token === 'string' &&
		value.token.length > 0 &&
		(value.e2eeKey === undefined || value.e2eeKey === null || isArrayBuffer(value.e2eeKey))
	);
}

const VOICE_ENGINE_V2_SCREEN_CODECS = new Set(['', 'vp8', 'vp9', 'h264', 'h265', 'av1']);
const VOICE_ENGINE_V2_SCREEN_PACING_MODES = new Set(['sender', 'source']);

export function isVoiceEngineV2BridgePublishScreenOptions(
	value: unknown,
): value is VoiceEngineV2BridgePublishScreenOptions {
	if (!isRecord(value)) return false;
	return (
		typeof value.captureId === 'string' &&
		value.captureId.length > 0 &&
		isPositiveFiniteNumber(value.width) &&
		isPositiveFiniteNumber(value.height) &&
		(value.codec === undefined ||
			(typeof value.codec === 'string' && VOICE_ENGINE_V2_SCREEN_CODECS.has(value.codec))) &&
		isOptionalBoolean(value.hardwareEncoding) &&
		isOptionalBoolean(value.zeroCopyRequired) &&
		isOptionalPositiveFiniteNumber(value.maxBitrateBps) &&
		isOptionalPositiveFiniteNumber(value.maxFramerate) &&
		isOptionalBoolean(value.adaptiveSend) &&
		isOptionalPositiveFiniteNumber(value.minVideoFps) &&
		isOptionalPositiveFiniteNumber(value.maxAudioBufferMs) &&
		(value.trackName === undefined || (typeof value.trackName === 'string' && value.trackName.length > 0)) &&
		(value.pacing === undefined ||
			(typeof value.pacing === 'string' && VOICE_ENGINE_V2_SCREEN_PACING_MODES.has(value.pacing)))
	);
}

export function isVoiceEngineV2BridgeUpdateScreenShareEncodingOptions(
	value: unknown,
): value is VoiceEngineV2BridgeUpdateScreenShareEncodingOptions {
	if (!isRecord(value)) return false;
	return (
		typeof value.captureId === 'string' &&
		value.captureId.length > 0 &&
		isPositiveFiniteNumber(value.width) &&
		isPositiveFiniteNumber(value.height) &&
		isOptionalPositiveFiniteNumber(value.frameRate) &&
		isOptionalPositiveFiniteNumber(value.maxBitrateBps) &&
		(value.codec === undefined ||
			(typeof value.codec === 'string' && VOICE_ENGINE_V2_SCREEN_CODECS.has(value.codec))) &&
		isOptionalBoolean(value.hardwareEncoding) &&
		isOptionalBoolean(value.zeroCopyRequired)
	);
}

export function isVoiceEngineV2BridgePublishMicrophoneOptions(
	value: unknown,
): value is VoiceEngineV2BridgePublishMicrophoneOptions {
	if (!isRecord(value)) return false;
	const mode = value.mode ?? 'device';
	const pcmTestValuesAreValid =
		mode !== 'pcm-test' || (isPositiveFiniteNumber(value.sampleRate) && isPositiveFiniteNumber(value.numChannels));
	return (
		(mode === 'device' || mode === 'pcm-test') &&
		isOptionalString(value.deviceId) &&
		isOptionalBoolean(value.echoCancellation) &&
		isOptionalBoolean(value.noiseSuppression) &&
		isOptionalBoolean(value.autoGainControl) &&
		isOptionalBoolean(value.deepFilter) &&
		isOptionalDeepFilterNoiseReductionLevel(value.deepFilterNoiseReductionLevel) &&
		isOptionalPositiveFiniteNumber(value.sampleRate) &&
		isOptionalPositiveFiniteNumber(value.numChannels) &&
		isOptionalPositiveFiniteNumber(value.maxBitrateBps) &&
		pcmTestValuesAreValid
	);
}

export function isVoiceEngineV2BridgePcmFrame(value: unknown): value is VoiceEngineV2BridgePcmFrame {
	if (!isRecord(value)) return false;
	return (
		isPositiveFiniteNumber(value.sampleRate) &&
		isPositiveFiniteNumber(value.numChannels) &&
		isArrayBuffer(value.samples)
	);
}

export function isVoiceEngineV2BridgeFloatPcmFrame(value: unknown): value is VoiceEngineV2BridgeFloatPcmFrame {
	if (!isRecord(value)) return false;
	return (
		isPositiveFiniteNumber(value.sampleRate) &&
		isPositiveFiniteNumber(value.numChannels) &&
		isFloat32Array(value.samples)
	);
}

export function isVoiceEngineV2BridgePublishScreenAudioOptions(
	value: unknown,
): value is VoiceEngineV2BridgePublishScreenAudioOptions {
	if (!isRecord(value)) return false;
	return (
		isPositiveFiniteNumber(value.sampleRate) &&
		isPositiveFiniteNumber(value.numChannels) &&
		(value.route === undefined || value.route === 'browser' || value.route === 'native') &&
		isOptionalString(value.captureId) &&
		isOptionalString(value.tapId)
	);
}

export function isVoiceEngineV2ParticipantVolumeOptions(
	value: unknown,
): value is VoiceEngineV2BridgeParticipantVolumeOptions {
	if (!isRecord(value)) return false;
	return typeof value.participantSid === 'string' && value.participantSid.length > 0 && isFiniteNumber(value.volume);
}

export function clampVoiceEngineV2ParticipantVolume(volume: number): number {
	if (!Number.isFinite(volume)) return 1;
	return Math.max(0, Math.min(2, volume));
}

export function isVoiceEngineV2BridgeSpeakingDetectionOptions(
	value: unknown,
): value is VoiceEngineV2BridgeSpeakingDetectionOptions {
	if (!isRecord(value)) return false;
	return isPositiveFiniteNumber(value.localThresholdRms) && isPositiveFiniteNumber(value.remoteThresholdRms);
}

export function isVoiceEngineV2BridgeRemoteTrackSubscriptionOptions(
	value: unknown,
): value is VoiceEngineV2BridgeRemoteTrackSubscriptionOptions {
	if (!isRecord(value)) return false;
	return (
		typeof value.participantIdentity === 'string' &&
		value.participantIdentity.length > 0 &&
		typeof value.source === 'string' &&
		value.source.length > 0 &&
		typeof value.subscribed === 'boolean' &&
		isOptionalBoolean(value.enabled) &&
		(value.quality === undefined || isVoiceEngineV2BridgeRemoteTrackSubscriptionQuality(value.quality))
	);
}

export function isVoiceEngineV2BridgePublishDataOptions(
	value: unknown,
): value is VoiceEngineV2BridgePublishDataOptions {
	if (!isRecord(value)) return false;
	return (
		isVoiceEngineV2BridgeBinaryPayload(value.payload) &&
		isOptionalBoolean(value.reliable) &&
		isOptionalString(value.topic) &&
		isOptionalStringArray(value.destinationIdentities)
	);
}

export function isVoiceEngineV2BridgePublishCameraOptions(
	value: unknown,
): value is VoiceEngineV2BridgePublishCameraOptions {
	if (!isRecord(value)) return false;
	return (
		isOptionalString(value.deviceId) &&
		isOptionalPositiveFiniteNumber(value.width) &&
		isOptionalPositiveFiniteNumber(value.height) &&
		isOptionalPositiveFiniteNumber(value.frameRate) &&
		isOptionalBoolean(value.mirror) &&
		isOptionalCameraBackgroundMode(value.backgroundMode) &&
		isOptionalString(value.backgroundCustomMediaPath) &&
		isOptionalCameraBackgroundCustomMediaKind(value.backgroundCustomMediaKind) &&
		isOptionalCameraEffectStrength(value.backgroundBlurStrength)
	);
}

export function isVoiceEngineV2BridgePublishProcessedCameraOptions(
	value: unknown,
): value is VoiceEngineV2BridgePublishProcessedCameraOptions {
	if (!isRecord(value)) return false;
	return (
		isPositiveEvenFiniteInteger(value.width) &&
		isPositiveEvenFiniteInteger(value.height) &&
		isPositiveFiniteInteger(value.frameRate)
	);
}

export function isVoiceEngineV2BridgePublishProcessedCameraResult(
	value: unknown,
): value is VoiceEngineV2BridgePublishProcessedCameraResult {
	if (!isRecord(value)) return false;
	return typeof value.trackSid === 'string' && value.trackSid.length > 0;
}

export function isVoiceEngineV2BridgeCameraPreviewInfo(value: unknown): value is VoiceEngineV2BridgeCameraPreviewInfo {
	if (!isRecord(value)) return false;
	return (
		typeof value.trackSid === 'string' &&
		value.trackSid.length > 0 &&
		isPositiveEvenFiniteInteger(value.width) &&
		isPositiveEvenFiniteInteger(value.height) &&
		isPositiveFiniteInteger(value.frameRate)
	);
}

export function isVoiceEngineV2BridgeProcessedCameraFrame(
	value: unknown,
): value is VoiceEngineV2BridgeProcessedCameraFrame {
	if (!isRecord(value)) return false;
	if (value.format !== 'i420') return false;
	if (!isPositiveEvenFiniteInteger(value.width)) return false;
	if (!isPositiveEvenFiniteInteger(value.height)) return false;
	if (!isPositiveFiniteInteger(value.timestampUs)) return false;
	if (!isVoiceEngineV2BridgeBinaryPayload(value.data)) return false;
	const expectedBytes = getVoiceEngineV2BridgeProcessedCameraI420ByteLength(value.width, value.height);
	return getVoiceEngineV2BridgeBinaryPayloadByteLength(value.data) === expectedBytes;
}

export function isVoiceEngineV2BridgeReadiness(value: unknown): value is VoiceEngineV2BridgeReadiness {
	if (!isRecord(value)) return false;
	if (typeof value.ready !== 'boolean') return false;
	if (value.ready) return value.reason === undefined;
	return isOptionalString(value.reason);
}

export function isVoiceEngineV2BridgePublishDeviceScreenShareOptions(
	value: unknown,
): value is VoiceEngineV2BridgePublishDeviceScreenShareOptions {
	if (!isRecord(value)) return false;
	return (
		isOptionalString(value.deviceId) &&
		isOptionalPositiveFiniteNumber(value.width) &&
		isOptionalPositiveFiniteNumber(value.height) &&
		isOptionalPositiveFiniteNumber(value.frameRate) &&
		(value.codec === undefined ||
			(typeof value.codec === 'string' && VOICE_ENGINE_V2_SCREEN_CODECS.has(value.codec))) &&
		isOptionalPositiveFiniteNumber(value.maxBitrateBps) &&
		isOptionalPositiveFiniteNumber(value.maxFramerate)
	);
}
