// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	canRestartDisplayShareWithoutPreselectedSource,
	type DisplayShareEnvironment,
	prestartAudioToggleIsPickerOwned,
} from '@app/features/voice/utils/ScreenShareEnvironment';
import type {StreamSettingsShareContext} from '@app/features/voice/utils/StreamSettingsUpdatePolicy';
import type {NativeAudioAvailability} from '@app/types/electron.d';
import {getInitialSnapshot, setup, transition} from 'xstate';

export type StreamSettingsAudioControlStateValue =
	| 'hidden'
	| 'unsupported'
	| 'prestartNativePickerOwned'
	| 'restartRequired'
	| 'toggle';
export type StreamSettingsAudioControlLabelKey = 'captureAppAudio' | 'captureDesktopAudio' | 'captureDeviceAudio';
export type StreamSettingsAudioControlHintKey = 'nativeAudioUnsupported' | 'prestartNativePicker' | 'restartRequired';
export type StreamSettingsNativeAudioUnsupportedScope = 'process' | 'system';
export type StreamSettingsNativePickerNoticeKey = 'browserManagedDesktopAudio' | 'systemManagedDesktopAudio';

export interface StreamSettingsNativeAudioSignals {
	shareContext: StreamSettingsShareContext;
	platform?: string | null;
	nativeAudioAvailability: NativeAudioAvailability | null;
}

export interface StreamSettingsAudioControlSignals extends StreamSettingsNativeAudioSignals {
	applyToLiveStream: boolean;
	displayShareEnvironment: DisplayShareEnvironment;
	supportsStreamAudio: boolean;
	captureAudioEnabled: boolean;
	hasLiveScreenShareAudioPublication: boolean;
}

export interface StreamSettingsAudioControlViewState {
	value: StreamSettingsAudioControlStateValue;
	visible: boolean;
	disabled: boolean;
	checked: boolean;
	labelKey: StreamSettingsAudioControlLabelKey;
	hintKey: StreamSettingsAudioControlHintKey | null;
}

export interface StreamSettingsAudioMenuViewState {
	control: StreamSettingsAudioControlViewState;
	nativeAudioUnsupportedScope: StreamSettingsNativeAudioUnsupportedScope | null;
	showNativePickerNotice: boolean;
	nativePickerNoticeKey: StreamSettingsNativePickerNoticeKey | null;
	showLinuxAudioControls: boolean;
	showDeviceAudioMenu: boolean;
}

type StreamSettingsAudioControlEvent = {
	type: 'audio.evaluate';
	signals: StreamSettingsAudioControlSignals;
};

export function selectStreamSettingsNativeAudioUnsupportedScope(
	shareContext: StreamSettingsShareContext,
): StreamSettingsNativeAudioUnsupportedScope | null {
	if (shareContext === 'app') return 'process';
	if (shareContext === 'display') return 'system';
	return null;
}

export function selectStreamSettingsNativeAudioUnsupportedOnThisOs(signals: StreamSettingsNativeAudioSignals): boolean {
	const scope = selectStreamSettingsNativeAudioUnsupportedScope(signals.shareContext);
	return (
		scope != null &&
		(signals.platform === 'win32' || signals.platform === 'darwin') &&
		signals.nativeAudioAvailability != null &&
		(signals.nativeAudioAvailability.capabilities?.[scope] === false ||
			(!signals.nativeAudioAvailability.available && signals.nativeAudioAvailability.reason === 'os-version-too-old'))
	);
}

function shouldRestartToEnableDisplayAudio(signals: StreamSettingsAudioControlSignals): boolean {
	return (
		signals.applyToLiveStream &&
		signals.shareContext === 'display' &&
		!signals.captureAudioEnabled &&
		!signals.hasLiveScreenShareAudioPublication &&
		!canRestartDisplayShareWithoutPreselectedSource(signals.displayShareEnvironment) &&
		!canEnableNativeDisplayAudioWithoutRestart(signals)
	);
}

function canEnableNativeDisplayAudioWithoutRestart(signals: StreamSettingsAudioControlSignals): boolean {
	if (signals.displayShareEnvironment !== 'desktop-custom') return false;
	if (signals.platform === 'linux') return true;
	if (signals.platform !== 'darwin' && signals.platform !== 'win32') return false;
	if (!signals.nativeAudioAvailability) return true;
	return signals.nativeAudioAvailability.available && signals.nativeAudioAvailability.capabilities?.system !== false;
}

function shouldDisablePrestartNativeAudioToggle(signals: StreamSettingsAudioControlSignals): boolean {
	return (
		!signals.applyToLiveStream &&
		signals.shareContext === 'display' &&
		prestartAudioToggleIsPickerOwned(signals.displayShareEnvironment)
	);
}

export const streamSettingsAudioControlStateMachine = setup({
	types: {} as {
		events: StreamSettingsAudioControlEvent;
	},
	guards: {
		isHidden: ({event}) => !event.signals.supportsStreamAudio,
		isUnsupported: ({event}) => selectStreamSettingsNativeAudioUnsupportedOnThisOs(event.signals),
		isPrestartNativePickerOwned: ({event}) => shouldDisablePrestartNativeAudioToggle(event.signals),
		isRestartRequired: ({event}) => shouldRestartToEnableDisplayAudio(event.signals),
	},
}).createMachine({
	id: 'streamSettingsAudioControl',
	initial: 'hidden',
	on: {
		'audio.evaluate': [
			{target: '.hidden', guard: 'isHidden'},
			{target: '.unsupported', guard: 'isUnsupported'},
			{target: '.prestartNativePickerOwned', guard: 'isPrestartNativePickerOwned'},
			{target: '.restartRequired', guard: 'isRestartRequired'},
			{target: '.toggle'},
		],
	},
	states: {
		hidden: {},
		unsupported: {},
		prestartNativePickerOwned: {},
		restartRequired: {},
		toggle: {},
	},
});

export function selectStreamSettingsAudioControlState(
	signals: StreamSettingsAudioControlSignals,
): StreamSettingsAudioControlStateValue {
	const [snapshot] = transition(
		streamSettingsAudioControlStateMachine,
		getInitialSnapshot(streamSettingsAudioControlStateMachine),
		{
			type: 'audio.evaluate',
			signals,
		},
	);
	return typeof snapshot.value === 'string' ? (snapshot.value as StreamSettingsAudioControlStateValue) : 'hidden';
}

function selectAudioControlLabelKey(shareContext: StreamSettingsShareContext): StreamSettingsAudioControlLabelKey {
	if (shareContext === 'device') return 'captureDeviceAudio';
	if (shareContext === 'app') return 'captureAppAudio';
	return 'captureDesktopAudio';
}

function selectAudioControlHintKey(
	value: StreamSettingsAudioControlStateValue,
): StreamSettingsAudioControlHintKey | null {
	if (value === 'unsupported') return 'nativeAudioUnsupported';
	if (value === 'prestartNativePickerOwned') return 'prestartNativePicker';
	if (value === 'restartRequired') return 'restartRequired';
	return null;
}

export function selectStreamSettingsAudioMenuState(
	signals: StreamSettingsAudioControlSignals,
): StreamSettingsAudioMenuViewState {
	const value = selectStreamSettingsAudioControlState(signals);
	return {
		control: {
			value,
			visible: value === 'toggle',
			disabled: value !== 'toggle',
			checked: signals.captureAudioEnabled,
			labelKey: selectAudioControlLabelKey(signals.shareContext),
			hintKey: selectAudioControlHintKey(value),
		},
		nativeAudioUnsupportedScope: selectStreamSettingsNativeAudioUnsupportedScope(signals.shareContext),
		showNativePickerNotice: false,
		nativePickerNoticeKey: null,
		showLinuxAudioControls:
			signals.supportsStreamAudio &&
			signals.captureAudioEnabled &&
			signals.shareContext !== 'device' &&
			signals.platform === 'linux',
		showDeviceAudioMenu: signals.shareContext === 'device' && signals.captureAudioEnabled,
	};
}
