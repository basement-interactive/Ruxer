// SPDX-License-Identifier: AGPL-3.0-or-later

import {Logger} from '@app/features/platform/utils/AppLogger';
import type {VoiceEngine} from '@app/features/voice/engine/native_voice_engine/VoiceEngine';
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
import type {VoiceEngineV2BridgeOperationResult} from '@fluxer/voice_engine_v2/bridge';

const ADAPTER_NAME = 'VoiceEngineV2AppNativeVoiceLiveKitMediaAdapter';

export interface VoiceEngineV2AppNativeVoiceMediaCameraDelegate {
	publishCamera(options: VoiceEngineV2CameraOptions): Promise<void>;
	updateCameraEncoding(options: VoiceEngineV2CameraEncodingOptions): Promise<void>;
	unpublishCamera(options?: VoiceEngineV2CameraOptions): Promise<void>;
}

export interface VoiceEngineV2AppNativeVoiceMediaScreenDelegate {
	publishScreen(options: VoiceEngineV2ScreenOptions): Promise<void>;
	updateScreenEncoding(options: VoiceEngineV2ScreenEncodingOptions): Promise<void>;
	unpublishScreen(): Promise<void>;
}

export interface VoiceEngineV2AppNativeVoiceLiveKitMediaAdapterOptions {
	getEngine: () => VoiceEngine;
	camera: VoiceEngineV2AppNativeVoiceMediaCameraDelegate;
	screen: VoiceEngineV2AppNativeVoiceMediaScreenDelegate;
	logger?: Logger;
}

function buildOperationError(method: string, result: VoiceEngineV2BridgeOperationResult): Error {
	const message = result.ok ? 'operation unexpectedly succeeded' : result.error.message;
	const error = new Error(`${ADAPTER_NAME}.${method}: ${message}`);
	error.name = 'VoiceEngineV2AppNativeVoiceMediaOperationError';
	return error;
}

function assertOperationSucceeded(method: string, result: VoiceEngineV2BridgeOperationResult): void {
	if (result.ok) return;
	throw buildOperationError(method, result);
}

export class VoiceEngineV2AppNativeVoiceLiveKitMediaAdapter implements LiveKitMediaPort {
	private readonly getEngine: () => VoiceEngine;
	private readonly camera: VoiceEngineV2AppNativeVoiceMediaCameraDelegate;
	private readonly screen: VoiceEngineV2AppNativeVoiceMediaScreenDelegate;
	private readonly logger: Logger;

	constructor(options: VoiceEngineV2AppNativeVoiceLiveKitMediaAdapterOptions) {
		if (typeof options !== 'object' || options === null) {
			throw new Error(`${ADAPTER_NAME}: options is required`);
		}
		this.getEngine = options.getEngine;
		this.camera = options.camera;
		this.screen = options.screen;
		this.logger = options.logger ?? new Logger(ADAPTER_NAME);
	}

	async prewarm(): Promise<void> {
		await this.getEngine().prewarm();
	}

	async connect(options: VoiceEngineV2ConnectOptions): Promise<void> {
		await this.getEngine().connect(options);
	}

	async disconnect(_reason: VoiceEngineV2DisconnectReason): Promise<void> {
		await this.getEngine().disconnect();
	}

	async publishMicrophone(options: VoiceEngineV2MicrophoneOptions): Promise<void> {
		const result = await this.getEngine().publishMicrophone(options);
		assertOperationSucceeded('publishMicrophone', result);
	}

	async unpublishMicrophone(): Promise<void> {
		const result = await this.getEngine().setMicEnabled(false);
		assertOperationSucceeded('unpublishMicrophone', result);
	}

	async setMicrophoneEnabled(enabled: boolean): Promise<void> {
		const result = await this.getEngine().setMicEnabled(enabled);
		assertOperationSucceeded('setMicrophoneEnabled', result);
	}

	async publishCamera(options: VoiceEngineV2CameraOptions): Promise<void> {
		await this.camera.publishCamera(options);
	}

	async updateCameraEncoding(options: VoiceEngineV2CameraEncodingOptions): Promise<void> {
		await this.camera.updateCameraEncoding(options);
	}

	async unpublishCamera(options?: VoiceEngineV2CameraOptions): Promise<void> {
		await this.camera.unpublishCamera(options);
	}

	async publishScreen(options: VoiceEngineV2ScreenOptions): Promise<void> {
		await this.screen.publishScreen(options);
	}

	async updateScreenEncoding(options: VoiceEngineV2ScreenEncodingOptions): Promise<void> {
		await this.screen.updateScreenEncoding(options);
	}

	async unpublishScreen(): Promise<void> {
		await this.screen.unpublishScreen();
	}

	async publishScreenAudio(options: VoiceEngineV2ScreenAudioOptions): Promise<void> {
		await this.getEngine().publishScreenShareAudio(options);
	}

	async unpublishScreenAudio(): Promise<void> {
		await this.getEngine().unpublishScreenShareAudio();
	}

	async setOutputDevice(options: VoiceEngineV2OutputDeviceOptions): Promise<void> {
		await this.getEngine().setAudioOutputDevice(options.deviceId);
	}

	async publishData(options: VoiceEngineV2DataOptions): Promise<void> {
		try {
			await this.getEngine().publishData(options);
		} catch (error) {
			this.logger.warn('Native data publish failed', {error});
			throw error;
		}
	}
}
