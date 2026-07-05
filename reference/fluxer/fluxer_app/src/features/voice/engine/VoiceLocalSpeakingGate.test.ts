// SPDX-License-Identifier: AGPL-3.0-or-later

import {describe, expect, it} from 'vitest';
import {type LocalSpeakingOverrideInput, resolveLocalSpeakingOverrideState} from './VoiceLocalSpeakingGate';

const UNMUTED_OPEN_MIC: LocalSpeakingOverrideInput = {
	pushToTalkActive: false,
	pushToMuteActive: false,
	pushToMuteHeld: false,
	selfDeaf: false,
	effectiveSelfMute: false,
	hasMicrophonePublication: true,
	microphonePublicationMuted: false,
};

describe('resolveLocalSpeakingOverrideState', () => {
	it('lets VAD own normal open-mic speaking state', () => {
		expect(resolveLocalSpeakingOverrideState(UNMUTED_OPEN_MIC)).toBeNull();
	});
	it('forces local speaking off when open mic is effectively muted', () => {
		expect(
			resolveLocalSpeakingOverrideState({
				...UNMUTED_OPEN_MIC,
				effectiveSelfMute: true,
				microphonePublicationMuted: true,
			}),
		).toBe(false);
	});
	it('uses the push-to-talk transmit gate instead of VAD', () => {
		expect(
			resolveLocalSpeakingOverrideState({
				...UNMUTED_OPEN_MIC,
				pushToTalkActive: true,
			}),
		).toBe(true);
		expect(
			resolveLocalSpeakingOverrideState({
				...UNMUTED_OPEN_MIC,
				pushToTalkActive: true,
				effectiveSelfMute: true,
				microphonePublicationMuted: true,
			}),
		).toBe(false);
	});
	it('does not mark push-to-talk speech active without a live mic publication', () => {
		expect(
			resolveLocalSpeakingOverrideState({
				...UNMUTED_OPEN_MIC,
				pushToTalkActive: true,
				hasMicrophonePublication: false,
				microphonePublicationMuted: true,
			}),
		).toBe(false);
	});
	it('forces local speaking off while push-to-mute is held', () => {
		expect(
			resolveLocalSpeakingOverrideState({
				...UNMUTED_OPEN_MIC,
				pushToMuteActive: true,
				pushToMuteHeld: true,
			}),
		).toBe(false);
	});
	it('forces local speaking off while deafened', () => {
		expect(
			resolveLocalSpeakingOverrideState({
				...UNMUTED_OPEN_MIC,
				selfDeaf: true,
			}),
		).toBe(false);
	});
});
