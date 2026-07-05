// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	type StreamSettingsAudioControlSignals,
	selectStreamSettingsAudioControlState,
	selectStreamSettingsAudioMenuState,
} from '@app/features/voice/components/StreamSettingsMenuContentStateMachine';
import type {NativeAudioAvailability} from '@app/types/electron.d';
import {describe, expect, it} from 'vitest';

function availableNativeAudio(overrides: Partial<NativeAudioAvailability> = {}): NativeAudioAvailability {
	return {
		available: true,
		capabilities: {
			process: true,
			system: true,
		},
		...overrides,
	};
}

function signals(overrides: Partial<StreamSettingsAudioControlSignals> = {}): StreamSettingsAudioControlSignals {
	return {
		applyToLiveStream: true,
		shareContext: 'display',
		displayShareEnvironment: 'desktop-custom',
		supportsStreamAudio: true,
		captureAudioEnabled: false,
		hasLiveScreenShareAudioPublication: false,
		nativeAudioAvailability: null,
		platform: null,
		...overrides,
	};
}

describe('StreamSettingsMenuContentStateMachine', () => {
	it('hides the audio control when stream audio capture is unavailable', () => {
		const state = selectStreamSettingsAudioMenuState(
			signals({
				supportsStreamAudio: false,
			}),
		);

		expect(state.control).toMatchObject({
			value: 'hidden',
			visible: false,
			disabled: true,
			labelKey: 'captureDesktopAudio',
			hintKey: null,
		});
		expect(state.showNativePickerNotice).toBe(false);
		expect(state.showLinuxAudioControls).toBe(false);
	});

	it('models native audio support blocks before other display audio states', () => {
		const appState = selectStreamSettingsAudioMenuState(
			signals({
				shareContext: 'app',
				platform: 'win32',
				nativeAudioAvailability: availableNativeAudio({
					capabilities: {
						process: false,
						system: true,
					},
				}),
			}),
		);
		expect(appState.control).toMatchObject({
			value: 'unsupported',
			visible: false,
			disabled: true,
			labelKey: 'captureAppAudio',
			hintKey: 'nativeAudioUnsupported',
		});
		expect(appState.nativeAudioUnsupportedScope).toBe('process');

		const displayState = selectStreamSettingsAudioMenuState(
			signals({
				displayShareEnvironment: 'web',
				platform: 'darwin',
				nativeAudioAvailability: availableNativeAudio({
					available: false,
					reason: 'os-version-too-old',
				}),
			}),
		);
		expect(displayState.control.value).toBe('unsupported');
		expect(displayState.nativeAudioUnsupportedScope).toBe('system');
	});

	it('disables prestart web desktop audio because the browser picker owns selection', () => {
		const state = selectStreamSettingsAudioMenuState(
			signals({
				applyToLiveStream: false,
				displayShareEnvironment: 'web',
			}),
		);

		expect(state.control).toMatchObject({
			value: 'prestartNativePickerOwned',
			visible: false,
			disabled: true,
			labelKey: 'captureDesktopAudio',
			hintKey: 'prestartNativePicker',
		});
		expect(state.showNativePickerNotice).toBe(false);
	});

	it('requires restart only when a live custom display share cannot add audio separately', () => {
		expect(selectStreamSettingsAudioControlState(signals({displayShareEnvironment: 'desktop-custom'}))).toBe(
			'restartRequired',
		);
		expect(
			selectStreamSettingsAudioControlState(
				signals({
					displayShareEnvironment: 'desktop-custom',
					platform: 'darwin',
					nativeAudioAvailability: availableNativeAudio(),
				}),
			),
		).toBe('toggle');
		expect(
			selectStreamSettingsAudioControlState(
				signals({
					displayShareEnvironment: 'desktop-custom',
					platform: 'linux',
				}),
			),
		).toBe('toggle');
		expect(
			selectStreamSettingsAudioControlState(
				signals({
					displayShareEnvironment: 'desktop-custom',
					hasLiveScreenShareAudioPublication: true,
				}),
			),
		).toBe('toggle');
		expect(
			selectStreamSettingsAudioControlState(
				signals({
					displayShareEnvironment: 'desktop-custom',
					captureAudioEnabled: true,
				}),
			),
		).toBe('toggle');
		expect(selectStreamSettingsAudioControlState(signals({displayShareEnvironment: 'web'}))).toBe('toggle');
	});

	it('hides native picker notices for live native display-share audio', () => {
		const webState = selectStreamSettingsAudioMenuState(
			signals({
				displayShareEnvironment: 'web',
			}),
		);
		expect(webState.control.value).toBe('toggle');
		expect(webState.showNativePickerNotice).toBe(false);
		expect(webState.nativePickerNoticeKey).toBe(null);

		const waylandState = selectStreamSettingsAudioMenuState(
			signals({
				displayShareEnvironment: 'desktop-wayland',
			}),
		);
		expect(waylandState.showNativePickerNotice).toBe(false);
		expect(waylandState.nativePickerNoticeKey).toBe(null);

		const customState = selectStreamSettingsAudioMenuState(
			signals({
				displayShareEnvironment: 'desktop-custom',
				captureAudioEnabled: true,
			}),
		);
		expect(customState.showNativePickerNotice).toBe(false);
	});

	it('selects Linux source controls only for enabled app or desktop audio', () => {
		expect(
			selectStreamSettingsAudioMenuState(
				signals({
					platform: 'linux',
					captureAudioEnabled: true,
				}),
			).showLinuxAudioControls,
		).toBe(true);
		expect(
			selectStreamSettingsAudioMenuState(
				signals({
					shareContext: 'app',
					platform: 'linux',
					captureAudioEnabled: true,
				}),
			).showLinuxAudioControls,
		).toBe(true);
		expect(
			selectStreamSettingsAudioMenuState(
				signals({
					shareContext: 'device',
					platform: 'linux',
					captureAudioEnabled: true,
				}),
			).showLinuxAudioControls,
		).toBe(false);
		expect(
			selectStreamSettingsAudioMenuState(
				signals({
					platform: 'linux',
					supportsStreamAudio: false,
					captureAudioEnabled: true,
				}),
			).showLinuxAudioControls,
		).toBe(false);
	});

	it('keeps device audio menu visibility tied to the device share audio setting', () => {
		const disabledCapture = selectStreamSettingsAudioMenuState(
			signals({
				shareContext: 'device',
				captureAudioEnabled: false,
			}),
		);
		expect(disabledCapture.control).toMatchObject({
			value: 'toggle',
			labelKey: 'captureDeviceAudio',
			checked: false,
		});
		expect(disabledCapture.showDeviceAudioMenu).toBe(false);

		const enabledCapture = selectStreamSettingsAudioMenuState(
			signals({
				shareContext: 'device',
				captureAudioEnabled: true,
			}),
		);
		expect(enabledCapture.control).toMatchObject({
			value: 'toggle',
			labelKey: 'captureDeviceAudio',
			checked: true,
		});
		expect(enabledCapture.showDeviceAudioMenu).toBe(true);

		const unsupportedDeviceCapture = selectStreamSettingsAudioMenuState(
			signals({
				shareContext: 'device',
				supportsStreamAudio: false,
				captureAudioEnabled: true,
			}),
		);
		expect(unsupportedDeviceCapture.control.value).toBe('hidden');
		expect(unsupportedDeviceCapture.showDeviceAudioMenu).toBe(true);
	});
});
