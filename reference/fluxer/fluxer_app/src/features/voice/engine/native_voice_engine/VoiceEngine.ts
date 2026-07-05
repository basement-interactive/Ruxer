// SPDX-License-Identifier: AGPL-3.0-or-later

import type {
	VoiceEngineV2BridgeAudioInputDevice,
	VoiceEngineV2BridgeAudioOutputDevice,
	VoiceEngineV2BridgeCameraDevice,
	VoiceEngineV2BridgeCapabilities,
	VoiceEngineV2BridgeConnectOptions,
	VoiceEngineV2BridgeEvent,
	VoiceEngineV2BridgeOperationResult,
	VoiceEngineV2BridgePcmFrame,
	VoiceEngineV2BridgeProcessedCameraFrame,
	VoiceEngineV2BridgePublishCameraOptions,
	VoiceEngineV2BridgePublishDataOptions,
	VoiceEngineV2BridgePublishDeviceScreenShareOptions,
	VoiceEngineV2BridgePublishMicrophoneOptions,
	VoiceEngineV2BridgePublishNativeCameraSinkResult,
	VoiceEngineV2BridgePublishProcessedCameraOptions,
	VoiceEngineV2BridgePublishProcessedCameraResult,
	VoiceEngineV2BridgePublishScreenAudioOptions,
	VoiceEngineV2BridgePublishScreenOptions,
	VoiceEngineV2BridgeRemoteTrackSubscriptionOptions,
	VoiceEngineV2BridgeSpeakingDetectionOptions,
	VoiceEngineV2BridgeStats,
	VoiceEngineV2BridgeUpdateScreenShareEncodingOptions,
} from '@fluxer/voice_engine_v2/bridge';

export interface VoiceEngine {
	readonly kind: 'native';
	getCapabilities(): Promise<VoiceEngineV2BridgeCapabilities>;
	prewarm(): Promise<void>;
	connect(params: VoiceEngineV2BridgeConnectOptions): Promise<void>;
	disconnect(): Promise<void>;
	isConnected(): boolean;
	publishMicrophone(params?: VoiceEngineV2BridgePublishMicrophoneOptions): Promise<VoiceEngineV2BridgeOperationResult>;
	publishScreenShare(params: VoiceEngineV2BridgePublishScreenOptions): Promise<void>;
	updateScreenShareEncoding(params: VoiceEngineV2BridgeUpdateScreenShareEncodingOptions): Promise<void>;
	unpublishScreenShare(): Promise<void>;
	publishScreenShareAudio(params: VoiceEngineV2BridgePublishScreenAudioOptions): Promise<void>;
	pushScreenShareAudioPcm(frame: VoiceEngineV2BridgePcmFrame): Promise<boolean>;
	unpublishScreenShareAudio(): Promise<void>;
	setMicEnabled(enabled: boolean): Promise<VoiceEngineV2BridgeOperationResult>;
	setSpeakingDetection(options: VoiceEngineV2BridgeSpeakingDetectionOptions): Promise<void>;
	publishCamera(params: VoiceEngineV2BridgePublishCameraOptions): Promise<void>;
	publishNativeCameraSink(
		params: VoiceEngineV2BridgePublishCameraOptions,
	): Promise<VoiceEngineV2BridgePublishNativeCameraSinkResult>;
	publishProcessedCamera(
		params: VoiceEngineV2BridgePublishProcessedCameraOptions,
	): Promise<VoiceEngineV2BridgePublishProcessedCameraResult>;
	pushProcessedCameraFrame(frame: VoiceEngineV2BridgeProcessedCameraFrame): Promise<boolean>;
	publishDeviceScreenShare(params: VoiceEngineV2BridgePublishDeviceScreenShareOptions): Promise<void>;
	listCameraDevices(): Promise<Array<VoiceEngineV2BridgeCameraDevice>>;
	unpublishCamera(): Promise<void>;
	isPublishingCamera(): boolean;
	listAudioInputDevices(): Promise<Array<VoiceEngineV2BridgeAudioInputDevice>>;
	listAudioOutputDevices(): Promise<Array<VoiceEngineV2BridgeAudioOutputDevice>>;
	setAudioOutputDevice(deviceId: string): Promise<void>;
	setParticipantVolume(participantSid: string, volume: number): Promise<void>;
	setRemoteTrackSubscription(options: VoiceEngineV2BridgeRemoteTrackSubscriptionOptions): Promise<void>;
	publishData(params: VoiceEngineV2BridgePublishDataOptions): Promise<void>;
	getConnectionStats(): Promise<VoiceEngineV2BridgeStats | null>;
	onEvent(listener: (event: VoiceEngineV2BridgeEvent) => void): () => void;
}
