// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	transitionVoiceControlBarState,
	type VoiceControlBarSignals,
} from '@app/features/voice/components/VoiceControlBarStateMachine';
import {describe, expect, it} from 'vitest';

function signals(overrides: Partial<VoiceControlBarSignals> = {}): VoiceControlBarSignals {
	return {
		isDeafened: false,
		isGuildMuted: false,
		isGuildDeafened: false,
		isPermissionMuted: false,
		isPushToTalkEffective: false,
		effectiveMuted: false,
		canStream: true,
		isCameraEnabled: false,
		isCameraLimitReached: false,
		isCameraUserCapReached: false,
		isScreenShareEnabled: false,
		screenShareDisabled: false,
		...overrides,
	};
}

describe('VoiceControlBarStateMachine', () => {
	it('allows normal mute and deafen toggles', () => {
		expect(transitionVoiceControlBarState(signals())).toMatchObject({
			mute: {disabled: false, pressed: false, label: 'mute'},
			deafen: {disabled: false, pressed: false, label: 'deafen'},
		});
		expect(
			transitionVoiceControlBarState(
				signals({
					effectiveMuted: true,
					isDeafened: true,
				}),
			),
		).toMatchObject({
			mute: {disabled: false, pressed: true, label: 'unmute'},
			deafen: {disabled: false, pressed: true, label: 'undeafen'},
		});
	});

	it('locks microphone controls for moderation, permission, and effective push-to-talk states', () => {
		expect(transitionVoiceControlBarState(signals({isGuildDeafened: true, effectiveMuted: true})).mute).toEqual({
			disabled: true,
			pressed: true,
			label: 'moderatorDeafened',
		});
		expect(transitionVoiceControlBarState(signals({isGuildMuted: true, effectiveMuted: true})).mute).toEqual({
			disabled: true,
			pressed: true,
			label: 'moderatorMuted',
		});
		expect(transitionVoiceControlBarState(signals({isPermissionMuted: true, effectiveMuted: true})).mute).toEqual({
			disabled: true,
			pressed: true,
			label: 'permissionMuted',
		});
		expect(transitionVoiceControlBarState(signals({isPushToTalkEffective: true})).mute).toMatchObject({
			disabled: true,
			label: 'pushToTalkHoldHint',
		});
	});

	it('locks deafen only when server deafened', () => {
		expect(transitionVoiceControlBarState(signals({isGuildDeafened: true})).deafen).toEqual({
			disabled: true,
			pressed: true,
			label: 'moderatorDeafened',
		});
		expect(transitionVoiceControlBarState(signals({isGuildMuted: true})).deafen).toMatchObject({
			disabled: false,
			pressed: false,
			label: 'deafen',
		});
	});

	it('models camera permission and participant limit states', () => {
		expect(transitionVoiceControlBarState(signals({canStream: false})).camera).toEqual({
			disabled: true,
			pressed: false,
			label: 'noPermission',
		});
		expect(transitionVoiceControlBarState(signals({canStream: false, isCameraEnabled: true})).camera).toEqual({
			disabled: false,
			pressed: true,
			label: 'turnOff',
		});
		expect(transitionVoiceControlBarState(signals({isCameraLimitReached: true})).camera).toEqual({
			disabled: true,
			pressed: false,
			label: 'limitReached',
		});
	});

	it('disables turning the camera on at the distinct camera user cap', () => {
		expect(transitionVoiceControlBarState(signals({isCameraUserCapReached: true})).camera).toEqual({
			disabled: true,
			pressed: false,
			label: 'userCapReached',
		});
	});

	it('never blocks turning the camera off at the camera user cap', () => {
		expect(
			transitionVoiceControlBarState(signals({isCameraUserCapReached: true, isCameraEnabled: true})).camera,
		).toEqual({
			disabled: false,
			pressed: true,
			label: 'turnOff',
		});
	});

	it('models screen-share permission and active states', () => {
		expect(transitionVoiceControlBarState(signals({screenShareDisabled: true})).screenShare).toEqual({
			disabled: true,
			pressed: false,
			label: 'noPermission',
		});
		expect(transitionVoiceControlBarState(signals({isScreenShareEnabled: true})).screenShare).toEqual({
			disabled: false,
			pressed: true,
			label: 'end',
		});
		expect(transitionVoiceControlBarState(signals()).screenShare).toEqual({
			disabled: false,
			pressed: false,
			label: 'start',
		});
	});
});
