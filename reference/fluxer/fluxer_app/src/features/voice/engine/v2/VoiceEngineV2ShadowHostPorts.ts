// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	createVoiceEngineV2PermissionResult,
	emptyVoiceEngineV2DeviceInventory,
	unavailableVoiceEngineV2HardwareEncoderCapabilities,
	type VoiceEngineV2CameraEncodingOptions,
	type VoiceEngineV2CameraOptions,
	type VoiceEngineV2ConnectOptions,
	type VoiceEngineV2DataOptions,
	type VoiceEngineV2DisconnectReason,
	type VoiceEngineV2GatewayVoiceStateWrite,
	type VoiceEngineV2HostPorts,
	type VoiceEngineV2MicrophoneOptions,
	type VoiceEngineV2NativeAudioTapOptions,
	type VoiceEngineV2NativeCaptureOptions,
	type VoiceEngineV2NativeFrameSinkOptions,
	type VoiceEngineV2OutputDeviceOptions,
	type VoiceEngineV2ParticipantVolumeOptions,
	type VoiceEngineV2PermissionName,
	type VoiceEngineV2RemoteTrackSubscriptionOptions,
	type VoiceEngineV2ScreenAudioOptions,
	type VoiceEngineV2ScreenEncodingOptions,
	type VoiceEngineV2ScreenOptions,
	type VoiceEngineV2TimerOptions,
} from '@fluxer/voice_engine_v2';

export type VoiceEngineV2ShadowHostPortCall =
	| {type: 'gateway.writeVoiceState'; options: VoiceEngineV2GatewayVoiceStateWrite}
	| {type: 'gateway.clearVoiceState'; guildId: string | null}
	| {type: 'liveKit.prewarm'}
	| {type: 'liveKit.connect'; options: VoiceEngineV2ConnectOptions}
	| {type: 'liveKit.disconnect'; reason: VoiceEngineV2DisconnectReason}
	| {type: 'liveKit.publishMicrophone'; options: VoiceEngineV2MicrophoneOptions}
	| {type: 'liveKit.unpublishMicrophone'}
	| {type: 'liveKit.setMicrophoneEnabled'; enabled: boolean}
	| {type: 'liveKit.publishCamera'; options: VoiceEngineV2CameraOptions}
	| {type: 'liveKit.updateCameraEncoding'; options: VoiceEngineV2CameraEncodingOptions}
	| {type: 'liveKit.unpublishCamera'}
	| {type: 'liveKit.publishScreen'; options: VoiceEngineV2ScreenOptions}
	| {type: 'liveKit.updateScreenEncoding'; options: VoiceEngineV2ScreenEncodingOptions}
	| {type: 'liveKit.unpublishScreen'}
	| {type: 'liveKit.publishScreenAudio'; options: VoiceEngineV2ScreenAudioOptions}
	| {type: 'liveKit.unpublishScreenAudio'}
	| {type: 'liveKit.setOutputDevice'; options: VoiceEngineV2OutputDeviceOptions}
	| {type: 'liveKit.setParticipantVolume'; options: VoiceEngineV2ParticipantVolumeOptions}
	| {type: 'liveKit.setRemoteTrackSubscription'; options: VoiceEngineV2RemoteTrackSubscriptionOptions}
	| {type: 'liveKit.publishData'; options: VoiceEngineV2DataOptions}
	| {type: 'liveKit.collectStats'}
	| {type: 'nativeMedia.startCapture'; options: VoiceEngineV2NativeCaptureOptions}
	| {type: 'nativeMedia.updateCapture'; options: VoiceEngineV2NativeCaptureOptions}
	| {type: 'nativeMedia.stopCapture'; captureId: string}
	| {type: 'nativeMedia.startAudioTap'; options: VoiceEngineV2NativeAudioTapOptions}
	| {type: 'nativeMedia.stopAudioTap'; tapId: string}
	| {type: 'nativeMedia.attachFrameSink'; options: VoiceEngineV2NativeFrameSinkOptions}
	| {type: 'nativeMedia.detachFrameSink'; sinkId: string}
	| {type: 'capabilities.getHardwareEncoderCapabilities'}
	| {type: 'devices.enumerate'}
	| {type: 'devices.selectAudioInput'; deviceId: string | null}
	| {type: 'devices.selectAudioOutput'; deviceId: string | null}
	| {type: 'devices.selectCamera'; deviceId: string | null}
	| {type: 'permissions.check'; name: VoiceEngineV2PermissionName}
	| {type: 'permissions.request'; name: VoiceEngineV2PermissionName}
	| {type: 'timers.schedule'; options: VoiceEngineV2TimerOptions}
	| {type: 'timers.cancel'; timerId: string}
	| {type: 'diagnostics.log'; level: string; code: string; message: string; detail?: unknown}
	| {type: 'operation.cancel'; operationId: number; reason: string}
	| {type: 'teardown'};

export interface VoiceEngineV2ShadowHostPortRecorder {
	record(call: VoiceEngineV2ShadowHostPortCall): void;
}

export function createVoiceEngineV2ShadowHostPorts(
	recorder?: VoiceEngineV2ShadowHostPortRecorder,
): VoiceEngineV2HostPorts {
	const record = (call: VoiceEngineV2ShadowHostPortCall): void => {
		recorder?.record(call);
	};
	return {
		gateway: {
			async writeVoiceState(options): Promise<void> {
				record({type: 'gateway.writeVoiceState', options});
			},
			async clearVoiceState(guildId): Promise<void> {
				record({type: 'gateway.clearVoiceState', guildId});
			},
		},
		liveKit: {
			async prewarm(): Promise<void> {
				record({type: 'liveKit.prewarm'});
			},
			async connect(options): Promise<void> {
				record({type: 'liveKit.connect', options});
			},
			async disconnect(reason): Promise<void> {
				record({type: 'liveKit.disconnect', reason});
			},
			async publishMicrophone(options): Promise<void> {
				record({type: 'liveKit.publishMicrophone', options});
			},
			async unpublishMicrophone(): Promise<void> {
				record({type: 'liveKit.unpublishMicrophone'});
			},
			async setMicrophoneEnabled(enabled): Promise<void> {
				record({type: 'liveKit.setMicrophoneEnabled', enabled});
			},
			async publishCamera(options): Promise<void> {
				record({type: 'liveKit.publishCamera', options});
			},
			async updateCameraEncoding(options): Promise<void> {
				record({type: 'liveKit.updateCameraEncoding', options});
			},
			async unpublishCamera(): Promise<void> {
				record({type: 'liveKit.unpublishCamera'});
			},
			async publishScreen(options): Promise<void> {
				record({type: 'liveKit.publishScreen', options});
			},
			async updateScreenEncoding(options): Promise<void> {
				record({type: 'liveKit.updateScreenEncoding', options});
			},
			async unpublishScreen(): Promise<void> {
				record({type: 'liveKit.unpublishScreen'});
			},
			async publishScreenAudio(options): Promise<void> {
				record({type: 'liveKit.publishScreenAudio', options});
			},
			async unpublishScreenAudio(): Promise<void> {
				record({type: 'liveKit.unpublishScreenAudio'});
			},
			async setOutputDevice(options): Promise<void> {
				record({type: 'liveKit.setOutputDevice', options});
			},
			async setParticipantVolume(options): Promise<void> {
				record({type: 'liveKit.setParticipantVolume', options});
			},
			async setRemoteTrackSubscription(options): Promise<void> {
				record({type: 'liveKit.setRemoteTrackSubscription', options});
			},
			async publishData(options): Promise<void> {
				record({type: 'liveKit.publishData', options});
			},
			async collectStats() {
				record({type: 'liveKit.collectStats'});
				return {rttMs: null, outbound: [], inbound: []};
			},
		},
		nativeMedia: {
			async startCapture(options): Promise<void> {
				record({type: 'nativeMedia.startCapture', options});
			},
			async updateCapture(options): Promise<void> {
				record({type: 'nativeMedia.updateCapture', options});
			},
			async stopCapture(captureId): Promise<void> {
				record({type: 'nativeMedia.stopCapture', captureId});
			},
			async startAudioTap(options): Promise<void> {
				record({type: 'nativeMedia.startAudioTap', options});
			},
			async stopAudioTap(tapId): Promise<void> {
				record({type: 'nativeMedia.stopAudioTap', tapId});
			},
			async attachFrameSink(options): Promise<void> {
				record({type: 'nativeMedia.attachFrameSink', options});
			},
			async detachFrameSink(sinkId): Promise<void> {
				record({type: 'nativeMedia.detachFrameSink', sinkId});
			},
		},
		capabilities: {
			async getHardwareEncoderCapabilities() {
				record({type: 'capabilities.getHardwareEncoderCapabilities'});
				return unavailableVoiceEngineV2HardwareEncoderCapabilities('shadow-host');
			},
		},
		devices: {
			async enumerateDevices() {
				record({type: 'devices.enumerate'});
				return emptyVoiceEngineV2DeviceInventory();
			},
			async selectAudioInput(deviceId): Promise<void> {
				record({type: 'devices.selectAudioInput', deviceId});
			},
			async selectAudioOutput(deviceId): Promise<void> {
				record({type: 'devices.selectAudioOutput', deviceId});
			},
			async selectCamera(deviceId): Promise<void> {
				record({type: 'devices.selectCamera', deviceId});
			},
		},
		permissions: {
			async checkPermission(name) {
				record({type: 'permissions.check', name});
				return createVoiceEngineV2PermissionResult(name, 'unknown');
			},
			async requestPermission(name) {
				record({type: 'permissions.request', name});
				return createVoiceEngineV2PermissionResult(name, 'unknown');
			},
		},
		timers: {
			async schedule(options): Promise<void> {
				record({type: 'timers.schedule', options});
			},
			async cancel(timerId): Promise<void> {
				record({type: 'timers.cancel', timerId});
			},
		},
		diagnostics: {
			async log(level, code, message, detail): Promise<void> {
				record({type: 'diagnostics.log', level, code, message, ...(detail === undefined ? {} : {detail})});
			},
		},
		async cancelOperation(operationId, reason): Promise<void> {
			record({type: 'operation.cancel', operationId, reason});
		},
		async teardown(): Promise<void> {
			record({type: 'teardown'});
		},
	};
}
