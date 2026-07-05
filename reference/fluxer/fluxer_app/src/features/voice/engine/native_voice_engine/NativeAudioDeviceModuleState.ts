// SPDX-License-Identifier: AGPL-3.0-or-later

import {Logger} from '@app/features/platform/utils/AppLogger';
import {getVoiceEngineV2AppNativeBridge} from '@app/features/voice/engine/v2/VoiceEngineV2AppNativeBridge';
import type {VoiceEngineV2BridgeApi, VoiceEngineV2BridgeAudioDeviceModuleState} from '@fluxer/voice_engine_v2/bridge';
import {VOICE_ENGINE_V2_ADM_STATUS_EVENT_TYPE} from '@fluxer/voice_engine_v2/bridge';

const logger = new Logger('NativeAudioDeviceModuleState');

export type NativeAudioDeviceModuleStatus = 'unknown' | 'unsupported' | 'warming' | 'ready' | 'failed';

type Listener = (status: NativeAudioDeviceModuleStatus) => void;

type AudioDeviceModuleStateBridge = VoiceEngineV2BridgeApi & {
	getAudioDeviceModuleState: () => Promise<VoiceEngineV2BridgeAudioDeviceModuleState>;
};

function getAudioDeviceModuleStateBridge(): AudioDeviceModuleStateBridge | null {
	const bridge = getVoiceEngineV2AppNativeBridge();
	if (!bridge) return null;
	if (typeof bridge.getAudioDeviceModuleState !== 'function') return null;
	return bridge as AudioDeviceModuleStateBridge;
}

function isKnownAudioDeviceModuleStatus(status: string): status is 'warming' | 'ready' | 'failed' {
	return status === 'warming' || status === 'ready' || status === 'failed';
}

class NativeAudioDeviceModuleStateStore {
	private status: NativeAudioDeviceModuleStatus = 'unknown';
	private listeners = new Set<Listener>();
	private eventsBound = false;
	private queryPromise: Promise<void> | null = null;

	public getStatus(): NativeAudioDeviceModuleStatus {
		return this.status;
	}

	public async ensureStatus(): Promise<NativeAudioDeviceModuleStatus> {
		const bridge = getAudioDeviceModuleStateBridge();
		if (!bridge) {
			return 'unsupported';
		}
		this.bindEvents(bridge);
		if (this.eventsBound && this.status !== 'unknown') {
			return this.status;
		}
		if (!this.queryPromise) {
			this.queryPromise = bridge
				.getAudioDeviceModuleState()
				.then((state) => {
					if (!isKnownAudioDeviceModuleStatus(state.status)) {
						logger.warn('Audio device module state query returned unknown status', {state});
						return;
					}
					if (this.eventsBound && this.status !== 'unknown') {
						return;
					}
					this.setStatus(state.status);
				})
				.catch((error) => {
					logger.warn('Failed to query audio device module state', {error});
				})
				.finally(() => {
					this.queryPromise = null;
				});
		}
		await this.queryPromise;
		if (this.status === 'unknown') {
			return 'unsupported';
		}
		return this.status;
	}

	public subscribe(listener: Listener): () => void {
		this.listeners.add(listener);
		const bridge = getAudioDeviceModuleStateBridge();
		if (bridge) {
			this.bindEvents(bridge);
		}
		return () => {
			this.listeners.delete(listener);
		};
	}

	private bindEvents(bridge: AudioDeviceModuleStateBridge): void {
		if (this.eventsBound) return;
		if (typeof bridge.onEvent !== 'function') return;
		this.eventsBound = true;
		bridge.onEvent((event) => {
			if (event.type !== VOICE_ENGINE_V2_ADM_STATUS_EVENT_TYPE) return;
			const payload = event.payload as VoiceEngineV2BridgeAudioDeviceModuleState;
			if (!isKnownAudioDeviceModuleStatus(payload.status)) {
				logger.warn('Ignoring audio device module status event with unknown status', {payload});
				return;
			}
			this.setStatus(payload.status);
		});
	}

	private setStatus(status: NativeAudioDeviceModuleStatus): void {
		if (this.status === status) return;
		logger.info('Audio device module status changed', {previous: this.status, next: status});
		this.status = status;
		this.listeners.forEach((listener) => listener(status));
	}
}

export const nativeAudioDeviceModuleState = new NativeAudioDeviceModuleStateStore();
