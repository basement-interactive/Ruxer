// SPDX-License-Identifier: AGPL-3.0-or-later
// biome-ignore-all lint/suspicious/noConfusingVoidType: IPC result metadata mirrors void-returning bridge methods.

import type {
	VoiceEngineV2CameraOptions,
	VoiceEngineV2ConnectOptions,
	VoiceEngineV2DataOptions,
	VoiceEngineV2HardwareEncoderCapabilities,
	VoiceEngineV2PcmFrame,
	VoiceEngineV2RemoteTrackQuality,
	VoiceEngineV2RemoteTrackSubscriptionOptions,
	VoiceEngineV2ScreenAudioOptions,
	VoiceEngineV2ScreenOptions,
	VoiceEngineV2SendStats,
	VoiceEngineV2TrackKind,
	VoiceEngineV2TrackSource,
	VoiceEngineV2VideoCodec,
} from '../protocol';

export const VOICE_ENGINE_V2_BRIDGE_VERSION = 18;

export type VoiceEngineV2BridgeMethodName =
	| 'isSupported'
	| 'getCapabilities'
	| 'prewarm'
	| 'getHardwareEncoderCapabilities'
	| 'connect'
	| 'disconnect'
	| 'isConnected'
	| 'publishMicrophone'
	| 'pushPcm'
	| 'publishScreen'
	| 'updateScreenShareEncoding'
	| 'unpublishScreen'
	| 'publishScreenAudio'
	| 'pushScreenAudioPcm'
	| 'pushScreenAudioFloat'
	| 'unpublishScreenAudio'
	| 'setMicEnabled'
	| 'setSpeakingDetection'
	| 'listAudioInputDevices'
	| 'listAudioOutputDevices'
	| 'setAudioOutputDevice'
	| 'setParticipantVolume'
	| 'setRemoteTrackSubscription'
	| 'publishData'
	| 'listCameraDevices'
	| 'publishCamera'
	| 'updateCameraCapture'
	| 'publishNativeCameraSink'
	| 'publishProcessedCamera'
	| 'pushProcessedCameraFrame'
	| 'pushCameraBackgroundFrame'
	| 'clearCameraBackgroundFrame'
	| 'publishDeviceScreenShare'
	| 'unpublishCamera'
	| 'isPublishingCamera'
	| 'startCameraPreview'
	| 'stopCameraPreview'
	| 'getConnectionStats'
	| 'getVoiceEngineReadiness'
	| 'getAudioDeviceModuleState'
	| 'onEvent'
	| 'onVideoFrame';

export type VoiceEngineV2InvokeMethodName = Exclude<VoiceEngineV2BridgeMethodName, 'onEvent' | 'onVideoFrame'>;

export type VoiceEngineV2BridgeConnectOptions = VoiceEngineV2ConnectOptions;

export type VoiceEngineV2BridgeScreenPacing = 'sender' | 'source';

export interface VoiceEngineV2BridgePublishScreenOptions extends VoiceEngineV2ScreenOptions {
	codec?: VoiceEngineV2VideoCodec;
	pacing?: VoiceEngineV2BridgeScreenPacing;
	trackName?: string;
}

export interface VoiceEngineV2BridgeUpdateScreenShareEncodingOptions {
	captureId: string;
	width: number;
	height: number;
	frameRate?: number;
	maxBitrateBps?: number;
	codec?: VoiceEngineV2VideoCodec;
	hardwareEncoding?: boolean;
	zeroCopyRequired?: boolean;
}

export interface VoiceEngineV2BridgePublishMicrophoneOptions {
	mode?: 'device' | 'pcm-test';
	deviceId?: string;
	echoCancellation?: boolean;
	noiseSuppression?: boolean;
	autoGainControl?: boolean;
	deepFilter?: boolean;
	deepFilterNoiseReductionLevel?: number;
	sampleRate?: number;
	numChannels?: number;
	maxBitrateBps?: number;
}

export type VoiceEngineV2BridgePcmFrame = VoiceEngineV2PcmFrame;
export interface VoiceEngineV2BridgeFloatPcmFrame {
	sampleRate: number;
	numChannels: number;
	samples: Float32Array;
}
export type VoiceEngineV2BridgePublishScreenAudioOptions = VoiceEngineV2ScreenAudioOptions;
export type VoiceEngineV2BridgePublishDataOptions = VoiceEngineV2DataOptions;

export type VoiceEngineV2BridgeTrackKind = VoiceEngineV2TrackKind;
export type VoiceEngineV2BridgeTrackSource =
	| VoiceEngineV2TrackSource
	| 'screen_share'
	| 'screen_share_audio'
	| 'screenshare'
	| 'screenshareAudio';
export type VoiceEngineV2BridgeSubscriptionStatus = 'desired' | 'subscribed' | 'unsubscribed';
export type VoiceEngineV2BridgeConnectionQuality = 'excellent' | 'good' | 'poor' | 'lost';

export interface VoiceEngineV2BridgeParticipantEventPayload {
	sid: string;
	identity: string;
	name: string;
}

export interface VoiceEngineV2BridgeTrackEventPayload {
	participantSid: string;
	identity: string;
	participantName: string;
	trackSid: string;
	trackName: string;
	kind: VoiceEngineV2BridgeTrackKind;
	source: VoiceEngineV2BridgeTrackSource;
	muted: boolean;
}

export interface VoiceEngineV2BridgeSubscribedTrackEventPayload extends VoiceEngineV2BridgeTrackEventPayload {
	subscribed: boolean;
	subscriptionStatus: VoiceEngineV2BridgeSubscriptionStatus;
}

export interface VoiceEngineV2BridgeTrackSubscriptionFailedEventPayload {
	participantSid: string;
	identity: string;
	participantName: string;
	trackSid: string;
	error: string;
	trackName?: string;
	kind?: VoiceEngineV2BridgeTrackKind;
	source?: VoiceEngineV2BridgeTrackSource;
	muted?: boolean;
	subscribed?: boolean;
	subscriptionStatus?: VoiceEngineV2BridgeSubscriptionStatus;
}

export interface VoiceEngineV2BridgeLocalTrackRepublishedEventPayload extends VoiceEngineV2BridgeTrackEventPayload {
	previousTrackSid: string;
}

export interface VoiceEngineV2BridgeEventPayloads {
	connected: Record<string, never>;
	connectionState: {state: string};
	disconnected: {reason: string};
	participantJoined: VoiceEngineV2BridgeParticipantEventPayload;
	participantLeft: VoiceEngineV2BridgeParticipantEventPayload;
	participantNameChanged: {sid: string; identity: string; oldName: string; name: string};
	participantMetadataChanged: {
		sid: string;
		identity: string;
		name: string;
		oldMetadata: string;
		metadata: string;
		attributes: Record<string, string>;
	};
	participantAttributesChanged: {
		sid: string;
		identity: string;
		name: string;
		attributes: Record<string, string>;
		changedAttributes: Record<string, string>;
	};
	trackPublished: VoiceEngineV2BridgeSubscribedTrackEventPayload;
	trackUnpublished: VoiceEngineV2BridgeSubscribedTrackEventPayload;
	trackSubscribed: VoiceEngineV2BridgeSubscribedTrackEventPayload;
	trackUnsubscribed: VoiceEngineV2BridgeSubscribedTrackEventPayload;
	trackSubscriptionFailed: VoiceEngineV2BridgeTrackSubscriptionFailedEventPayload;
	trackMuted: VoiceEngineV2BridgeTrackEventPayload;
	trackUnmuted: VoiceEngineV2BridgeTrackEventPayload;
	localTrackPublished: VoiceEngineV2BridgeTrackEventPayload;
	localTrackUnpublished: VoiceEngineV2BridgeTrackEventPayload;
	localTrackRepublished: VoiceEngineV2BridgeLocalTrackRepublishedEventPayload;
	activeSpeakers: {
		sids: Array<string>;
		participants: Array<VoiceEngineV2BridgeParticipantEventPayload>;
	};
	speakingChanged: {
		participantSid: string;
		identity: string;
		trackSid: string;
		source: VoiceEngineV2BridgeTrackSource;
		isLocal: boolean;
		speaking: boolean;
	};
	connectionQuality: {
		sid: string;
		identity: string;
		name: string;
		quality: VoiceEngineV2BridgeConnectionQuality;
	};
	dataReceived: {
		payloadBytes: Array<number>;
		payloadText?: string;
		topic?: string;
		reliable: boolean;
		kind: 'reliable' | 'lossy';
		participantSid?: string;
		identity?: string;
		participantName?: string;
	};
	e2eeState: {sid: string; identity: string; name: string; state: string};
	stats: VoiceEngineV2BridgeStats;
	audioPlaybackUnavailable: {message: string};
	engineReady: {ready: true};
	audioDeviceModuleStatus: VoiceEngineV2BridgeAudioDeviceModuleState;
}

export const VOICE_ENGINE_V2_ENGINE_READY_EVENT_TYPE = 'engineReady';
export const VOICE_ENGINE_V2_ADM_STATUS_EVENT_TYPE = 'audioDeviceModuleStatus';

export interface VoiceEngineV2BridgeReadiness {
	ready: boolean;
	reason?: string;
}

export type VoiceEngineV2BridgeAudioDeviceModuleStatus = 'warming' | 'ready' | 'failed';

export interface VoiceEngineV2BridgeAudioDeviceModuleState {
	status: VoiceEngineV2BridgeAudioDeviceModuleStatus;
	detail?: string;
}

export type VoiceEngineV2BridgeKnownEventType = keyof VoiceEngineV2BridgeEventPayloads;
export type VoiceEngineV2BridgeEventType = VoiceEngineV2BridgeKnownEventType | (string & {});
export type VoiceEngineV2BridgeKnownEvent = {
	[Type in VoiceEngineV2BridgeKnownEventType]: {type: Type; payload: VoiceEngineV2BridgeEventPayloads[Type]};
}[VoiceEngineV2BridgeKnownEventType];
export type VoiceEngineV2BridgeEvent =
	| VoiceEngineV2BridgeKnownEvent
	| {type: string & {}; payload: Record<string, unknown>};

export interface VoiceEngineV2BridgeVideoFrameMeta {
	bridgeVersion?: number;
	participantSid: string;
	participantIdentity?: string;
	trackSid: string;
	trackName?: string;
	source?: VoiceEngineV2BridgeTrackSource;
	width: number;
	height: number;
	timestampUs: number;
}

export interface VoiceEngineV2BridgeVideoFrame {
	meta: VoiceEngineV2BridgeVideoFrameMeta;
	data: ArrayBuffer;
}

export type VoiceEngineV2BridgeAudioDeviceRole = 'default' | 'communications' | 'endpoint';

export interface VoiceEngineV2BridgeAudioOutputDevice {
	deviceId: string;
	label: string;
	isDefault: boolean;
	role?: VoiceEngineV2BridgeAudioDeviceRole;
	endpointLabel?: string;
	isDefaultRoute?: boolean;
}

export interface VoiceEngineV2BridgeAudioInputDevice {
	deviceId: string;
	label: string;
	isDefault: boolean;
	role?: VoiceEngineV2BridgeAudioDeviceRole;
	endpointLabel?: string;
	isDefaultRoute?: boolean;
}

export interface VoiceEngineV2BridgeCameraDevice {
	deviceId: string;
	label: string;
	description: string;
	index?: number | null;
	deviceIdAliases?: Array<string>;
}

export const VOICE_ENGINE_V2_CAMERA_EFFECT_STRENGTH_MIN = 0;
export const VOICE_ENGINE_V2_CAMERA_EFFECT_STRENGTH_MAX = 100;
export const VOICE_ENGINE_V2_CAMERA_EFFECT_STRENGTH_DEFAULT = 50;

export interface VoiceEngineV2BridgePublishCameraOptions extends VoiceEngineV2CameraOptions {
	mirror?: boolean;
	backgroundBlurStrength?: number;
}

export type VoiceEngineV2BridgeUpdateCameraCaptureOptions = VoiceEngineV2BridgePublishCameraOptions;
export type VoiceEngineV2BridgeCameraBackgroundMode = 'none' | 'non' | 'blur' | 'custom';
export type VoiceEngineV2BridgeCameraBackgroundCustomMediaKind = 'static' | 'animated' | 'video';

export interface VoiceEngineV2BridgePublishProcessedCameraOptions {
	width: number;
	height: number;
	frameRate: number;
}

export interface VoiceEngineV2BridgePublishProcessedCameraResult {
	trackSid: string;
}

export type VoiceEngineV2BridgePublishNativeCameraSinkResult = VoiceEngineV2BridgePublishProcessedCameraResult;

export type VoiceEngineV2BridgeStartCameraPreviewOptions = VoiceEngineV2BridgePublishCameraOptions;

export interface VoiceEngineV2BridgeCameraPreviewInfo {
	trackSid: string;
	width: number;
	height: number;
	frameRate: number;
}

export type VoiceEngineV2BridgeProcessedCameraFrameFormat = 'i420';

export interface VoiceEngineV2BridgeProcessedCameraFrame {
	format: VoiceEngineV2BridgeProcessedCameraFrameFormat;
	width: number;
	height: number;
	timestampUs: number;
	data: ArrayBuffer | ArrayBufferView;
}

export interface VoiceEngineV2BridgePublishDeviceScreenShareOptions {
	deviceId?: string;
	width?: number;
	height?: number;
	frameRate?: number;
	codec?: VoiceEngineV2VideoCodec;
	maxBitrateBps?: number;
	maxFramerate?: number;
}

export interface VoiceEngineV2BridgeOutboundStat {
	trackSid: string;
	source: string;
	kind: VoiceEngineV2BridgeTrackKind;
	codec?: string;
	bitrateKbps: number;
	packetsLost: number;
	fps?: number;
	audioLevel?: number;
	width?: number;
	height?: number;
	sourceWidth?: number;
	sourceHeight?: number;
	targetBitrateKbps?: number;
	configuredFps?: number;
	targetFps?: number;
	effectiveFps?: number;
	framesProduced?: number;
	framesAccepted?: number;
	framesDropped?: number;
	framesCoalesced?: number;
	framesCaptured?: number;
	captureFailures?: number;
	maxQueueAgeMs?: number;
	maxPushLatencyMs?: number;
	adaptiveSendTier?: string;
	adaptiveSendReason?: string;
	zeroCopy?: boolean;
}

export interface VoiceEngineV2BridgeInboundStat {
	participantSid: string;
	participantIdentity?: string;
	trackSid: string;
	source?: string;
	kind: VoiceEngineV2BridgeTrackKind;
	codec?: string;
	bitrateKbps: number;
	packetsLost: number;
	jitterMs?: number;
	audioLevel?: number;
	width?: number;
	height?: number;
	fps?: number;
	sourceWidth?: number;
	sourceHeight?: number;
}

export type VoiceEngineV2BridgeSendStats = VoiceEngineV2SendStats;

export interface VoiceEngineV2BridgeStats {
	rttMs: number | null;
	outbound: Array<VoiceEngineV2BridgeOutboundStat>;
	inbound: Array<VoiceEngineV2BridgeInboundStat>;
	droppedNativeVideoFrames?: number;
	droppedVideoFrameCallbacks?: number;
	send?: VoiceEngineV2BridgeSendStats | null;
}

export type VoiceEngineV2BridgeRemoteTrackSubscriptionQuality = VoiceEngineV2RemoteTrackQuality;
export type VoiceEngineV2BridgeRemoteTrackSubscriptionOptions = VoiceEngineV2RemoteTrackSubscriptionOptions;

export type VoiceEngineV2BridgeHardwareEncoderBackend = 'nvenc' | 'videotoolbox' | 'none' | string;
export type VoiceEngineV2BridgeHardwareEncoderCapabilities = VoiceEngineV2HardwareEncoderCapabilities;

export interface VoiceEngineV2BridgeCapabilities {
	microphoneCapture: boolean;
	syntheticMicrophonePcm: boolean;
	cameraCapture: boolean;
	nativeCameraBackgrounds: boolean;
	screenShare: boolean;
	screenShareEncodingUpdate: boolean;
	screenShareAudio: boolean;
	deviceLists: boolean;
	outputDeviceSelection: boolean;
	participantVolume: boolean;
	remoteTrackSubscription: boolean;
	dataChannel: boolean;
	connectionStats: boolean;
	nativeVideoFrames: boolean;
	hardwareEncoderCapabilities: boolean;
}

export type VoiceEngineV2BridgeOperationErrorCode =
	| 'unsupported-capability'
	| 'not-connected'
	| 'invalid-args'
	| 'native-error';

export interface VoiceEngineV2BridgeOperationError {
	code: VoiceEngineV2BridgeOperationErrorCode;
	message: string;
	capability?: keyof VoiceEngineV2BridgeCapabilities | string;
}

export interface VoiceEngineV2BridgeOperationSuccess {
	ok: true;
}

export interface VoiceEngineV2BridgeOperationFailure {
	ok: false;
	error: VoiceEngineV2BridgeOperationError;
}

export type VoiceEngineV2BridgeOperationResult =
	| VoiceEngineV2BridgeOperationSuccess
	| VoiceEngineV2BridgeOperationFailure;

export const VOICE_ENGINE_V2_OPERATION_SUCCESS: VoiceEngineV2BridgeOperationSuccess = {ok: true};

export function createVoiceEngineV2OperationFailure(
	error: VoiceEngineV2BridgeOperationError,
): VoiceEngineV2BridgeOperationFailure {
	return {ok: false, error};
}

export interface VoiceEngineV2BridgeParticipantVolumeOptions {
	participantSid: string;
	volume: number;
}

export interface VoiceEngineV2BridgeSpeakingDetectionOptions {
	localThresholdRms: number;
	remoteThresholdRms: number;
}

export interface VoiceEngineV2BridgeIpcMethods {
	isSupported: {args: []; result: boolean};
	getCapabilities: {args: []; result: VoiceEngineV2BridgeCapabilities};
	prewarm: {args: []; result: void};
	getHardwareEncoderCapabilities: {args: []; result: VoiceEngineV2BridgeHardwareEncoderCapabilities};
	connect: {args: [VoiceEngineV2BridgeConnectOptions]; result: void};
	disconnect: {args: []; result: void};
	isConnected: {args: []; result: boolean};
	publishMicrophone: {args: [VoiceEngineV2BridgePublishMicrophoneOptions]; result: VoiceEngineV2BridgeOperationResult};
	pushPcm: {args: [VoiceEngineV2BridgePcmFrame]; result: boolean};
	publishScreen: {args: [VoiceEngineV2BridgePublishScreenOptions]; result: void};
	updateScreenShareEncoding: {args: [VoiceEngineV2BridgeUpdateScreenShareEncodingOptions]; result: void};
	unpublishScreen: {args: []; result: void};
	publishScreenAudio: {args: [VoiceEngineV2BridgePublishScreenAudioOptions]; result: void};
	pushScreenAudioPcm: {args: [VoiceEngineV2BridgePcmFrame]; result: boolean};
	pushScreenAudioFloat: {args: [VoiceEngineV2BridgeFloatPcmFrame]; result: boolean};
	unpublishScreenAudio: {args: []; result: void};
	setMicEnabled: {args: [boolean]; result: VoiceEngineV2BridgeOperationResult};
	setSpeakingDetection: {args: [VoiceEngineV2BridgeSpeakingDetectionOptions]; result: void};
	listAudioInputDevices: {args: []; result: Array<VoiceEngineV2BridgeAudioInputDevice>};
	listAudioOutputDevices: {args: []; result: Array<VoiceEngineV2BridgeAudioOutputDevice>};
	setAudioOutputDevice: {args: [string]; result: void};
	setParticipantVolume: {args: [VoiceEngineV2BridgeParticipantVolumeOptions]; result: void};
	setRemoteTrackSubscription: {args: [VoiceEngineV2BridgeRemoteTrackSubscriptionOptions]; result: void};
	publishData: {args: [VoiceEngineV2BridgePublishDataOptions]; result: void};
	listCameraDevices: {args: []; result: Array<VoiceEngineV2BridgeCameraDevice>};
	publishCamera: {args: [VoiceEngineV2BridgePublishCameraOptions]; result: void};
	updateCameraCapture: {args: [VoiceEngineV2BridgeUpdateCameraCaptureOptions]; result: void};
	publishNativeCameraSink: {
		args: [VoiceEngineV2BridgePublishCameraOptions];
		result: VoiceEngineV2BridgePublishNativeCameraSinkResult;
	};
	publishProcessedCamera: {
		args: [VoiceEngineV2BridgePublishProcessedCameraOptions];
		result: VoiceEngineV2BridgePublishProcessedCameraResult;
	};
	pushProcessedCameraFrame: {args: [VoiceEngineV2BridgeProcessedCameraFrame]; result: boolean};
	pushCameraBackgroundFrame: {args: [VoiceEngineV2BridgeProcessedCameraFrame]; result: boolean};
	clearCameraBackgroundFrame: {args: []; result: void};
	publishDeviceScreenShare: {args: [VoiceEngineV2BridgePublishDeviceScreenShareOptions]; result: void};
	unpublishCamera: {args: []; result: void};
	isPublishingCamera: {args: []; result: boolean};
	startCameraPreview: {
		args: [VoiceEngineV2BridgeStartCameraPreviewOptions];
		result: VoiceEngineV2BridgeCameraPreviewInfo;
	};
	stopCameraPreview: {args: []; result: void};
	getConnectionStats: {args: []; result: VoiceEngineV2BridgeStats};
	getVoiceEngineReadiness: {args: []; result: VoiceEngineV2BridgeReadiness};
	getAudioDeviceModuleState: {args: []; result: VoiceEngineV2BridgeAudioDeviceModuleState};
}

export const VOICE_ENGINE_V2_BRIDGE_METHODS = [
	'isSupported',
	'getCapabilities',
	'prewarm',
	'getHardwareEncoderCapabilities',
	'connect',
	'disconnect',
	'isConnected',
	'publishMicrophone',
	'pushPcm',
	'publishScreen',
	'updateScreenShareEncoding',
	'unpublishScreen',
	'publishScreenAudio',
	'pushScreenAudioPcm',
	'pushScreenAudioFloat',
	'unpublishScreenAudio',
	'setMicEnabled',
	'setSpeakingDetection',
	'listAudioInputDevices',
	'listAudioOutputDevices',
	'setAudioOutputDevice',
	'setParticipantVolume',
	'setRemoteTrackSubscription',
	'publishData',
	'listCameraDevices',
	'publishCamera',
	'updateCameraCapture',
	'publishNativeCameraSink',
	'publishProcessedCamera',
	'pushProcessedCameraFrame',
	'pushCameraBackgroundFrame',
	'clearCameraBackgroundFrame',
	'publishDeviceScreenShare',
	'unpublishCamera',
	'isPublishingCamera',
	'startCameraPreview',
	'stopCameraPreview',
	'getConnectionStats',
	'getVoiceEngineReadiness',
	'getAudioDeviceModuleState',
	'onEvent',
	'onVideoFrame',
] as const satisfies ReadonlyArray<VoiceEngineV2BridgeMethodName>;

export const VOICE_ENGINE_V2_IPC_CHANNELS = {
	isSupported: 'voice-engine-v2:is-supported',
	getCapabilities: 'voice-engine-v2:get-capabilities',
	prewarm: 'voice-engine-v2:prewarm',
	getHardwareEncoderCapabilities: 'voice-engine-v2:get-hardware-encoder-capabilities',
	connect: 'voice-engine-v2:connect',
	disconnect: 'voice-engine-v2:disconnect',
	isConnected: 'voice-engine-v2:is-connected',
	publishMicrophone: 'voice-engine-v2:publish-microphone',
	pushPcm: 'voice-engine-v2:push-pcm',
	publishScreen: 'voice-engine-v2:publish-screen',
	updateScreenShareEncoding: 'voice-engine-v2:update-screen-share-encoding',
	unpublishScreen: 'voice-engine-v2:unpublish-screen',
	publishScreenAudio: 'voice-engine-v2:publish-screen-audio',
	pushScreenAudioPcm: 'voice-engine-v2:push-screen-audio-pcm',
	pushScreenAudioFloat: 'voice-engine-v2:push-screen-audio-float',
	unpublishScreenAudio: 'voice-engine-v2:unpublish-screen-audio',
	setMicEnabled: 'voice-engine-v2:set-mic-enabled',
	setSpeakingDetection: 'voice-engine-v2:set-speaking-detection',
	listAudioInputDevices: 'voice-engine-v2:list-audio-input-devices',
	listAudioOutputDevices: 'voice-engine-v2:list-audio-output-devices',
	setAudioOutputDevice: 'voice-engine-v2:set-audio-output-device',
	setParticipantVolume: 'voice-engine-v2:set-participant-volume',
	setRemoteTrackSubscription: 'voice-engine-v2:set-remote-track-subscription',
	publishData: 'voice-engine-v2:publish-data',
	listCameraDevices: 'voice-engine-v2:list-camera-devices',
	publishCamera: 'voice-engine-v2:publish-camera',
	updateCameraCapture: 'voice-engine-v2:update-camera-capture',
	publishNativeCameraSink: 'voice-engine-v2:publish-native-camera-sink',
	publishProcessedCamera: 'voice-engine-v2:publish-processed-camera',
	pushProcessedCameraFrame: 'voice-engine-v2:push-processed-camera-frame',
	pushCameraBackgroundFrame: 'voice-engine-v2:push-camera-background-frame',
	clearCameraBackgroundFrame: 'voice-engine-v2:clear-camera-background-frame',
	publishDeviceScreenShare: 'voice-engine-v2:publish-device-screen-share',
	unpublishCamera: 'voice-engine-v2:unpublish-camera',
	isPublishingCamera: 'voice-engine-v2:is-publishing-camera',
	startCameraPreview: 'voice-engine-v2:start-camera-preview',
	stopCameraPreview: 'voice-engine-v2:stop-camera-preview',
	getConnectionStats: 'voice-engine-v2:get-connection-stats',
	getVoiceEngineReadiness: 'voice-engine-v2:get-readiness',
	getAudioDeviceModuleState: 'voice-engine-v2:get-audio-device-module-state',
} as const satisfies {[Method in VoiceEngineV2InvokeMethodName]: string};

export const VOICE_ENGINE_V2_EVENT_CHANNELS = {
	event: 'voice-engine-v2:event',
	videoFrame: 'voice-engine-v2:video-frame',
} as const satisfies {
	event: string;
	videoFrame: string;
};

export interface VoiceEngineV2BridgePushedEvents {
	event: VoiceEngineV2BridgeEvent;
	videoFrame: VoiceEngineV2BridgeVideoFrame;
}

export interface VoiceEngineV2BridgeApi {
	bridgeVersion: number;
	isSupported(): Promise<boolean>;
	getCapabilities(): Promise<VoiceEngineV2BridgeCapabilities>;
	prewarm(): Promise<void>;
	getHardwareEncoderCapabilities(): Promise<VoiceEngineV2BridgeHardwareEncoderCapabilities>;
	connect(options: VoiceEngineV2BridgeConnectOptions): Promise<void>;
	disconnect(): Promise<void>;
	isConnected(): Promise<boolean>;
	publishMicrophone(options: VoiceEngineV2BridgePublishMicrophoneOptions): Promise<VoiceEngineV2BridgeOperationResult>;
	pushPcm(frame: VoiceEngineV2BridgePcmFrame): Promise<boolean>;
	publishScreen(options: VoiceEngineV2BridgePublishScreenOptions): Promise<void>;
	updateScreenShareEncoding(options: VoiceEngineV2BridgeUpdateScreenShareEncodingOptions): Promise<void>;
	unpublishScreen(): Promise<void>;
	publishScreenAudio(options: VoiceEngineV2BridgePublishScreenAudioOptions): Promise<void>;
	pushScreenAudioPcm(frame: VoiceEngineV2BridgePcmFrame): Promise<boolean>;
	pushScreenAudioFloat(frame: VoiceEngineV2BridgeFloatPcmFrame): Promise<boolean>;
	unpublishScreenAudio(): Promise<void>;
	setMicEnabled(enabled: boolean): Promise<VoiceEngineV2BridgeOperationResult>;
	setSpeakingDetection(options: VoiceEngineV2BridgeSpeakingDetectionOptions): Promise<void>;
	listAudioInputDevices(): Promise<Array<VoiceEngineV2BridgeAudioInputDevice>>;
	listAudioOutputDevices(): Promise<Array<VoiceEngineV2BridgeAudioOutputDevice>>;
	setAudioOutputDevice(deviceId: string): Promise<void>;
	setParticipantVolume(participantSid: string, volume: number): Promise<void>;
	setRemoteTrackSubscription(options: VoiceEngineV2BridgeRemoteTrackSubscriptionOptions): Promise<void>;
	publishData(options: VoiceEngineV2BridgePublishDataOptions): Promise<void>;
	listCameraDevices(): Promise<Array<VoiceEngineV2BridgeCameraDevice>>;
	publishCamera(options: VoiceEngineV2BridgePublishCameraOptions): Promise<void>;
	updateCameraCapture(options: VoiceEngineV2BridgeUpdateCameraCaptureOptions): Promise<void>;
	publishNativeCameraSink(
		options: VoiceEngineV2BridgePublishCameraOptions,
	): Promise<VoiceEngineV2BridgePublishNativeCameraSinkResult>;
	publishProcessedCamera(
		options: VoiceEngineV2BridgePublishProcessedCameraOptions,
	): Promise<VoiceEngineV2BridgePublishProcessedCameraResult>;
	pushProcessedCameraFrame(frame: VoiceEngineV2BridgeProcessedCameraFrame): Promise<boolean>;
	pushCameraBackgroundFrame(frame: VoiceEngineV2BridgeProcessedCameraFrame): Promise<boolean>;
	clearCameraBackgroundFrame(): Promise<void>;
	publishDeviceScreenShare(options: VoiceEngineV2BridgePublishDeviceScreenShareOptions): Promise<void>;
	unpublishCamera(): Promise<void>;
	isPublishingCamera(): Promise<boolean>;
	startCameraPreview(
		options: VoiceEngineV2BridgeStartCameraPreviewOptions,
	): Promise<VoiceEngineV2BridgeCameraPreviewInfo>;
	stopCameraPreview(): Promise<void>;
	getConnectionStats(): Promise<VoiceEngineV2BridgeStats>;
	getVoiceEngineReadiness(): Promise<VoiceEngineV2BridgeReadiness>;
	getAudioDeviceModuleState?(): Promise<VoiceEngineV2BridgeAudioDeviceModuleState>;
	onEvent(callback: (event: VoiceEngineV2BridgeEvent) => void): () => void;
	onVideoFrame(callback: (frame: VoiceEngineV2BridgeVideoFrame) => void): () => void;
}
