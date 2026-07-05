// SPDX-License-Identifier: AGPL-3.0-or-later

import {handleMediaPermissionBlocked} from '@app/features/permissions/system/commands/MacPermissionsModalCommands';
import MediaPermission from '@app/features/permissions/system/state/MediaPermission';
import VoiceDevicePermissionState from '@app/features/voice/engine/VoiceDevicePermissionState';
import type {VoiceDeviceState} from '@app/features/voice/utils/VoiceDeviceManager';
import {useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react';

type PermissionType = 'audio' | 'video';
type BrowserPermissionState = 'denied' | 'granted' | 'prompt';

interface PermissionState {
	status: 'idle' | 'loading' | 'granted' | 'denied';
	devices: Array<MediaDeviceInfo>;
	deviceState: VoiceDeviceState;
}

interface UseMediaPermissionOptions {
	autoRequest?: boolean;
}

const devicesFromVoiceState = (deviceState: VoiceDeviceState, type: PermissionType): Array<MediaDeviceInfo> => {
	if (type === 'audio') {
		return [...deviceState.inputDevices, ...deviceState.outputDevices];
	}
	return deviceState.videoDevices;
};
const hasPrimaryDeviceForType = (devices: Array<MediaDeviceInfo>, type: PermissionType) => {
	const requiredKind = type === 'audio' ? 'audioinput' : 'videoinput';
	return devices.some((device) => device.kind === requiredKind);
};
const resolveStatusFromVoiceState = ({
	cachedPermissionState,
	deviceState,
	isExplicitlyDenied,
	osPermissionLooksGranted,
}: {
	cachedPermissionState: BrowserPermissionState | null;
	deviceState: VoiceDeviceState;
	isExplicitlyDenied: boolean;
	osPermissionLooksGranted: boolean;
}): PermissionState['status'] => {
	if (isExplicitlyDenied) return 'denied';
	if (deviceState.permissionStatus === 'loading') return 'loading';
	if (deviceState.permissionStatus === 'granted') return 'granted';
	if (deviceState.permissionStatus === 'denied') return 'denied';
	if (cachedPermissionState === 'granted' || osPermissionLooksGranted) return 'loading';
	return 'idle';
};
export const useMediaPermission = (type: PermissionType, options: UseMediaPermissionOptions = {}) => {
	const {autoRequest = true} = options;
	const micExplicitlyDenied = MediaPermission.microphoneExplicitlyDenied;
	const cameraExplicitlyDenied = MediaPermission.cameraExplicitlyDenied;
	const isExplicitlyDenied = type === 'audio' ? micExplicitlyDenied : cameraExplicitlyDenied;
	const cachedPermissionState =
		type === 'audio' ? MediaPermission.microphonePermissionState : MediaPermission.cameraPermissionState;
	const osPermissionLooksGranted = cachedPermissionState === 'granted';
	const initialDeviceState = VoiceDevicePermissionState.getState();
	const [state, setState] = useState<PermissionState>(() => ({
		status: resolveStatusFromVoiceState({
			cachedPermissionState,
			deviceState: initialDeviceState,
			isExplicitlyDenied,
			osPermissionLooksGranted,
		}),
		devices: devicesFromVoiceState(initialDeviceState, type),
		deviceState: initialDeviceState,
	}));
	const applyVoiceDeviceState = useCallback(
		(deviceState: VoiceDeviceState): PermissionState => {
			const nextState = {
				status: resolveStatusFromVoiceState({
					cachedPermissionState,
					deviceState,
					isExplicitlyDenied,
					osPermissionLooksGranted,
				}),
				devices: devicesFromVoiceState(deviceState, type),
				deviceState,
			};
			setState(nextState);
			return nextState;
		},
		[cachedPermissionState, isExplicitlyDenied, osPermissionLooksGranted, type],
	);
	const unlockDevices = useCallback(async (): Promise<PermissionState> => {
		setState((prev) => ({...prev, status: 'loading'}));
		const deviceState = await VoiceDevicePermissionState.ensureDevices({
			requestPermissions: true,
			forceRefresh: true,
		});
		if (deviceState.permissionStatus === 'granted') {
			if (type === 'audio') {
				MediaPermission.updateMicrophonePermissionGranted({refreshDevices: false});
			} else {
				MediaPermission.updateCameraPermissionGranted({refreshDevices: false});
			}
		} else if (deviceState.permissionStatus === 'denied') {
			if (type === 'audio') {
				MediaPermission.markMicrophoneExplicitlyDenied();
			} else {
				MediaPermission.markCameraExplicitlyDenied();
			}
		}
		return applyVoiceDeviceState(deviceState);
	}, [applyVoiceDeviceState, type]);
	const requestPermission = useCallback(async () => {
		if (isExplicitlyDenied) {
			handleMediaPermissionBlocked(type === 'audio' ? 'microphone' : 'camera');
			return false;
		}
		const currentDeviceState = VoiceDevicePermissionState.getState();
		const currentDevices = devicesFromVoiceState(currentDeviceState, type);
		if (currentDeviceState.permissionStatus === 'granted' && hasPrimaryDeviceForType(currentDevices, type)) {
			applyVoiceDeviceState(currentDeviceState);
			return true;
		}
		try {
			const nextState = await unlockDevices();
			if (nextState.status === 'denied') {
				handleMediaPermissionBlocked(type === 'audio' ? 'microphone' : 'camera');
				return false;
			}
			return nextState.status === 'granted' && hasPrimaryDeviceForType(nextState.devices, type);
		} catch {
			return false;
		}
	}, [type, isExplicitlyDenied, applyVoiceDeviceState, unlockDevices]);
	const unlockDevicesRef = useRef(unlockDevices);
	useLayoutEffect(() => {
		unlockDevicesRef.current = unlockDevices;
	}, [unlockDevices]);
	useEffect(() => VoiceDevicePermissionState.subscribe(applyVoiceDeviceState), [applyVoiceDeviceState]);
	useLayoutEffect(() => {
		if (isExplicitlyDenied) {
			setState((prev) => ({...prev, status: 'denied'}));
			return;
		}
		if (!autoRequest && !osPermissionLooksGranted) {
			return;
		}
		void unlockDevicesRef.current().catch(() => {});
	}, [isExplicitlyDenied, type, autoRequest, osPermissionLooksGranted]);
	return {
		...state,
		isExplicitlyDenied,
		requestPermission,
	};
};
