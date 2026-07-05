// SPDX-License-Identifier: AGPL-3.0-or-later

import {Logger} from '@app/features/platform/utils/AppLogger';
import type {
	LiveKitMediaPort,
	VoiceEngineV2CameraEncodingOptions,
	VoiceEngineV2CameraOptions,
	VoiceEngineV2ConnectOptions,
	VoiceEngineV2DataOptions,
	VoiceEngineV2DisconnectReason,
	VoiceEngineV2MicrophoneOptions,
	VoiceEngineV2OutputDeviceOptions,
	VoiceEngineV2ScreenAudioOptions,
	VoiceEngineV2ScreenEncodingOptions,
	VoiceEngineV2ScreenOptions,
} from '@fluxer/voice_engine_v2';

const ADAPTER_NAME = 'VoiceEngineV2AppSelectedMediaExecutionAdapter';

export type VoiceEngineV2AppSelectedMediaMode = 'js' | 'native';

export interface VoiceEngineV2AppSelectedMediaExecutionAdapterLogger {
	info(...args: Array<unknown>): void;
}

export interface VoiceEngineV2AppSelectedMediaExecutionAdapterOptions {
	jsMedia: LiveKitMediaPort;
	nativeMedia: LiveKitMediaPort;
	getMode: () => VoiceEngineV2AppSelectedMediaMode;
	logger?: VoiceEngineV2AppSelectedMediaExecutionAdapterLogger;
}

export class VoiceEngineV2AppSelectedMediaExecutionAdapter implements LiveKitMediaPort {
	private readonly jsMedia: LiveKitMediaPort;
	private readonly nativeMedia: LiveKitMediaPort;
	private readonly getMode: () => VoiceEngineV2AppSelectedMediaMode;
	private readonly logger: VoiceEngineV2AppSelectedMediaExecutionAdapterLogger;
	private lastMode: VoiceEngineV2AppSelectedMediaMode | null = null;

	constructor(options: VoiceEngineV2AppSelectedMediaExecutionAdapterOptions) {
		if (typeof options !== 'object' || options === null) {
			throw new Error(`${ADAPTER_NAME}: options is required`);
		}
		this.jsMedia = options.jsMedia;
		this.nativeMedia = options.nativeMedia;
		this.getMode = options.getMode;
		this.logger = options.logger ?? new Logger(ADAPTER_NAME);
	}

	async prewarm(): Promise<void> {
		await this.selectedMedia('prewarm').prewarm();
	}

	async connect(options: VoiceEngineV2ConnectOptions): Promise<void> {
		await this.selectedMedia('connect').connect(options);
	}

	async disconnect(reason: VoiceEngineV2DisconnectReason): Promise<void> {
		await this.selectedMedia('disconnect').disconnect(reason);
	}

	async publishMicrophone(options: VoiceEngineV2MicrophoneOptions): Promise<void> {
		await this.selectedMedia('publishMicrophone').publishMicrophone(options);
	}

	async unpublishMicrophone(): Promise<void> {
		await this.selectedMedia('unpublishMicrophone').unpublishMicrophone();
	}

	async setMicrophoneEnabled(enabled: boolean): Promise<void> {
		await this.selectedMedia('setMicrophoneEnabled').setMicrophoneEnabled(enabled);
	}

	async publishCamera(options: VoiceEngineV2CameraOptions): Promise<void> {
		await this.selectedMedia('publishCamera').publishCamera(options);
	}

	async updateCameraEncoding(options: VoiceEngineV2CameraEncodingOptions): Promise<void> {
		await this.selectedMedia('updateCameraEncoding').updateCameraEncoding(options);
	}

	async unpublishCamera(options?: VoiceEngineV2CameraOptions): Promise<void> {
		await this.selectedMedia('unpublishCamera').unpublishCamera(options);
	}

	async publishScreen(options: VoiceEngineV2ScreenOptions): Promise<void> {
		await this.selectedMedia('publishScreen').publishScreen(options);
	}

	async updateScreenEncoding(options: VoiceEngineV2ScreenEncodingOptions): Promise<void> {
		await this.selectedMedia('updateScreenEncoding').updateScreenEncoding(options);
	}

	async unpublishScreen(): Promise<void> {
		await this.selectedMedia('unpublishScreen').unpublishScreen();
	}

	async publishScreenAudio(options: VoiceEngineV2ScreenAudioOptions): Promise<void> {
		await this.selectedMedia('publishScreenAudio').publishScreenAudio(options);
	}

	async unpublishScreenAudio(): Promise<void> {
		await this.selectedMedia('unpublishScreenAudio').unpublishScreenAudio();
	}

	async setOutputDevice(options: VoiceEngineV2OutputDeviceOptions): Promise<void> {
		await this.selectedMedia('setOutputDevice').setOutputDevice(options);
	}

	async publishData(options: VoiceEngineV2DataOptions): Promise<void> {
		await this.selectedMedia('publishData').publishData(options);
	}

	private selectedMedia(method: string): LiveKitMediaPort {
		const mode = this.getMode();
		if (mode !== this.lastMode) {
			this.lastMode = mode;
			this.logger.info('Selected voice media port changed', {mode, method});
		}
		return mode === 'native' ? this.nativeMedia : this.jsMedia;
	}
}
