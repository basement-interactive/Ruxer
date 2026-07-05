// SPDX-License-Identifier: AGPL-3.0-or-later

import MediaPermission from '@app/features/permissions/system/state/MediaPermission';
import {Logger} from '@app/features/platform/utils/AppLogger';
import {
	type EnsureVoiceDevicesOptions,
	type VoiceDeviceState,
	voiceDeviceManager,
} from '@app/features/voice/utils/VoiceDeviceManager';

const logger = new Logger('VoiceDevicePermissionState');

type DeviceListener = (state: VoiceDeviceState) => void;

class VoiceDevicePermissionState {
	deviceState: VoiceDeviceState = voiceDeviceManager.getState();
	private deviceListeners = new Set<DeviceListener>();
	private permissionRequestInFlight: Promise<boolean> | null = null;

	constructor() {
		voiceDeviceManager.subscribe((state) => this.handleDeviceStateChange(state));
	}

	private handleDeviceStateChange(state: VoiceDeviceState): void {
		this.deviceState = state;
		this.deviceListeners.forEach((listener) => {
			try {
				listener(state);
			} catch (error) {
				logger.error('Voice device listener threw', {error});
			}
		});
	}

	getState(): VoiceDeviceState {
		return this.deviceState;
	}

	subscribe(listener: DeviceListener): () => void {
		this.deviceListeners.add(listener);
		listener(this.deviceState);
		return () => {
			this.deviceListeners.delete(listener);
		};
	}

	async ensureDevices(options: EnsureVoiceDevicesOptions = {}): Promise<VoiceDeviceState> {
		const state = await voiceDeviceManager.ensureDevices(options);
		if (this.deviceState !== state) {
			this.handleDeviceStateChange(state);
		}
		return state;
	}

	async refreshDevices(requestPermissions?: boolean): Promise<VoiceDeviceState> {
		return this.ensureDevices({requestPermissions, forceRefresh: true});
	}

	async requestPermissionFor(type: 'audio' | 'video'): Promise<boolean> {
		if (this.permissionRequestInFlight) {
			return this.permissionRequestInFlight;
		}
		const requestPromise = (async (): Promise<boolean> => {
			const state = await this.ensureDevices({requestPermissions: true});
			if (state.permissionStatus === 'granted') {
				if (type === 'audio') {
					MediaPermission.updateMicrophonePermissionGranted({refreshDevices: false});
				} else {
					MediaPermission.updateCameraPermissionGranted({refreshDevices: false});
				}
				return true;
			}
			if (state.permissionStatus === 'denied') {
				if (type === 'audio') {
					MediaPermission.markMicrophoneExplicitlyDenied();
				} else {
					MediaPermission.markCameraExplicitlyDenied();
				}
				return false;
			}
			return type === 'audio' ? MediaPermission.isMicrophoneGranted() : MediaPermission.isCameraGranted();
		})()
			.catch((error) => {
				logger.error('Failed to request media permission', {type, error});
				return false;
			})
			.finally(() => {
				this.permissionRequestInFlight = null;
			});
		this.permissionRequestInFlight = requestPromise;
		return requestPromise;
	}
}

export default new VoiceDevicePermissionState();
