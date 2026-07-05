// @vitest-environment happy-dom
// SPDX-License-Identifier: AGPL-3.0-or-later

import {VoiceConnectionQuality} from '@app/features/voice/engine/VoiceTrackSource';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import type {VoiceEngineV2AppControllerHost} from './v2/VoiceEngineV2AppControllerHost';
import {createVoiceEngineV2AppTestControllerHost} from './v2/VoiceEngineV2AppControllerHostTestUtils';
import {
	createVoiceEngineV2AppParticipantAdapter,
	NATIVE_SPEAKING_HEARTBEAT_TIMEOUT_MS,
	type VoiceEngineV2AppLivekitParticipantSnapshot,
	type VoiceEngineV2AppParticipantAdapter,
} from './v2/VoiceEngineV2AppParticipantAdapter';
import {createVoiceEngineV2ShadowHostPorts} from './v2/VoiceEngineV2ShadowHostPorts';

let host: VoiceEngineV2AppControllerHost;
let participantAdapter: VoiceEngineV2AppParticipantAdapter;

function isParticipantSnapshotSpeaking(snapshot: VoiceEngineV2AppLivekitParticipantSnapshot | undefined): boolean {
	return Boolean(snapshot?.isSpeaking || snapshot?.isAudioLevelSpeaking);
}

beforeEach(() => {
	host = createVoiceEngineV2AppTestControllerHost({ports: createVoiceEngineV2ShadowHostPorts()});
	participantAdapter = createVoiceEngineV2AppParticipantAdapter({
		controller: host.controller,
		getModel: () => host.model,
		now: () => 1000,
	});
});

afterEach(() => {
	participantAdapter.clear();
	host.dispose();
});

describe('VoiceEngineV2AppParticipantAdapter native snapshot methods', () => {
	it('upsertParticipantFromNative creates a snapshot with parsed userId/connectionId', () => {
		participantAdapter.upsertParticipantFromNative({identity: 'user_42_connA', sid: 'PA_1', name: 'Ada'});
		const snapshot = participantAdapter.getParticipant('user_42_connA');
		expect(snapshot).toBeDefined();
		expect(snapshot?.userId).toBe('42');
		expect(snapshot?.connectionId).toBe('connA');
		expect(snapshot?.sid).toBe('PA_1');
		expect(snapshot?.connectionQuality).toBe(VoiceConnectionQuality.Unknown);
		expect(snapshot?.isScreenShareEnabled).toBe(false);
		expect(snapshot?.isScreenShareAudioEnabled).toBe(false);
	});

	it('upsertParticipantFromNative merges over an existing snapshot (preserves prior flags)', () => {
		participantAdapter.upsertParticipantFromNative({
			identity: 'user_42_connA',
			sid: 'PA_1',
			isScreenShareEnabled: true,
			isScreenShareAudioEnabled: true,
		});
		participantAdapter.upsertParticipantFromNative({identity: 'user_42_connA', sid: 'PA_1'});
		expect(participantAdapter.getParticipant('user_42_connA')?.isScreenShareEnabled).toBe(true);
		expect(participantAdapter.getParticipant('user_42_connA')?.isScreenShareAudioEnabled).toBe(true);
	});

	it('patchParticipantTrackFlags flips the requested track flag only', () => {
		participantAdapter.upsertParticipantFromNative({identity: 'user_42_connA', sid: 'PA_1'});
		participantAdapter.patchParticipantTrackFlags('user_42_connA', {
			isCameraEnabled: true,
			isScreenShareAudioEnabled: true,
		});
		const snapshot = participantAdapter.getParticipant('user_42_connA');
		expect(snapshot?.isCameraEnabled).toBe(true);
		expect(snapshot?.isMicrophoneEnabled).toBe(false);
		expect(snapshot?.isScreenShareEnabled).toBe(false);
		expect(snapshot?.isScreenShareAudioEnabled).toBe(true);
	});

	it('patchParticipantTrackFlags is a no-op for an unknown participant', () => {
		participantAdapter.patchParticipantTrackFlags('user_999_x', {isMicrophoneEnabled: true});
		expect(participantAdapter.getParticipant('user_999_x')).toBeUndefined();
	});

	it('setConnectionQualityForNative updates by sid', () => {
		participantAdapter.upsertParticipantFromNative({identity: 'user_42_connA', sid: 'PA_1'});
		participantAdapter.setConnectionQualityForNative('PA_1', VoiceConnectionQuality.Poor);
		expect(participantAdapter.getParticipant('user_42_connA')?.connectionQuality).toBe(VoiceConnectionQuality.Poor);
	});

	it('updateActiveSpeakersBySid marks the matching participants speaking', () => {
		participantAdapter.upsertParticipantFromNative({identity: 'user_1_a', sid: 'PA_1'});
		participantAdapter.upsertParticipantFromNative({identity: 'user_2_b', sid: 'PA_2'});
		participantAdapter.updateActiveSpeakersBySid(['PA_2']);
		expect(participantAdapter.getParticipant('user_1_a')?.isSpeaking).toBe(false);
		expect(participantAdapter.getParticipant('user_2_b')?.isSpeaking).toBe(true);
		expect(isParticipantSnapshotSpeaking(participantAdapter.getParticipant('user_2_b'))).toBe(true);
		participantAdapter.updateActiveSpeakersBySid([]);
		expect(participantAdapter.getParticipant('user_2_b')?.isSpeaking).toBe(false);
		expect(isParticipantSnapshotSpeaking(participantAdapter.getParticipant('user_2_b'))).toBe(false);
	});

	it('applies native speaking transitions for remote participants', () => {
		participantAdapter.upsertParticipantFromNative({identity: 'user_1_a', sid: 'PA_1'});
		participantAdapter.upsertParticipantFromNative({identity: 'user_2_b', sid: 'PA_2'});
		participantAdapter.applyNativeSpeakingSample(
			{participantSid: 'PA_2', identity: 'user_2_b', source: 'microphone', isLocal: false, speaking: true},
			1000,
		);
		expect(participantAdapter.getParticipant('user_1_a')?.isAudioLevelSpeaking).toBe(false);
		expect(participantAdapter.getParticipant('user_2_b')?.isAudioLevelSpeaking).toBe(true);
		expect(participantAdapter.getParticipant('user_2_b')?.isSpeaking).toBe(false);
		expect(participantAdapter.getParticipant('user_2_b')?.lastSpokeAt).toBe(1000);

		participantAdapter.applyNativeSpeakingSample(
			{participantSid: 'PA_2', identity: 'user_2_b', source: 'microphone', isLocal: false, speaking: false},
			1400,
		);
		expect(participantAdapter.getParticipant('user_2_b')?.isAudioLevelSpeaking).toBe(false);
		expect(isParticipantSnapshotSpeaking(participantAdapter.getParticipant('user_2_b'))).toBe(false);
	});

	it('applies native speaking transitions for the local participant', () => {
		participantAdapter.upsertParticipantFromNative({identity: 'user_1_a', sid: 'PA_1', isLocal: true});
		participantAdapter.applyNativeSpeakingSample(
			{participantSid: 'PA_1', identity: 'user_1_a', source: 'microphone', isLocal: true, speaking: true},
			1000,
		);
		expect(participantAdapter.getParticipant('user_1_a')?.isAudioLevelSpeaking).toBe(true);
		expect(isParticipantSnapshotSpeaking(participantAdapter.getParticipant('user_1_a'))).toBe(true);

		participantAdapter.applyNativeSpeakingSample(
			{participantSid: 'PA_1', identity: 'user_1_a', source: 'microphone', isLocal: true, speaking: false},
			1500,
		);
		expect(participantAdapter.getParticipant('user_1_a')?.isAudioLevelSpeaking).toBe(false);
		expect(isParticipantSnapshotSpeaking(participantAdapter.getParticipant('user_1_a'))).toBe(false);
	});

	it('resolves native speaking samples by sid when the identity is unknown', () => {
		participantAdapter.upsertParticipantFromNative({identity: 'user_2_b', sid: 'PA_2'});
		participantAdapter.applyNativeSpeakingSample(
			{participantSid: 'PA_2', identity: 'user_renamed', source: 'microphone', isLocal: false, speaking: true},
			1000,
		);
		expect(participantAdapter.getParticipant('user_2_b')?.isAudioLevelSpeaking).toBe(true);
	});

	it('ignores native speaking samples for unknown participants', () => {
		participantAdapter.applyNativeSpeakingSample(
			{participantSid: 'PA_404', identity: 'user_404_x', source: 'microphone', isLocal: false, speaking: true},
			1000,
		);
		expect(participantAdapter.getParticipant('user_404_x')).toBeUndefined();
	});

	it('keeps speaking alive on heartbeats and clears it when heartbeats stop', () => {
		participantAdapter.upsertParticipantFromNative({identity: 'user_1_a', sid: 'PA_1', isLocal: true});
		participantAdapter.applyNativeSpeakingSample(
			{participantSid: 'PA_1', identity: 'user_1_a', source: 'microphone', isLocal: true, speaking: true},
			1000,
		);
		participantAdapter.applyNativeSpeakingSample(
			{participantSid: 'PA_1', identity: 'user_1_a', source: 'microphone', isLocal: true, speaking: true},
			2000,
		);
		participantAdapter.sweepNativeSpeakingHeartbeats(2000 + NATIVE_SPEAKING_HEARTBEAT_TIMEOUT_MS - 1);
		expect(participantAdapter.getParticipant('user_1_a')?.isAudioLevelSpeaking).toBe(true);

		participantAdapter.sweepNativeSpeakingHeartbeats(2000 + NATIVE_SPEAKING_HEARTBEAT_TIMEOUT_MS);
		expect(participantAdapter.getParticipant('user_1_a')?.isAudioLevelSpeaking).toBe(false);
	});

	it('does not clear speaking on sweep while heartbeats keep arriving', () => {
		participantAdapter.upsertParticipantFromNative({identity: 'user_1_a', sid: 'PA_1', isLocal: true});
		participantAdapter.applyNativeSpeakingSample(
			{participantSid: 'PA_1', identity: 'user_1_a', source: 'microphone', isLocal: true, speaking: true},
			1000,
		);
		for (let tick = 1; tick <= 5; tick++) {
			participantAdapter.applyNativeSpeakingSample(
				{participantSid: 'PA_1', identity: 'user_1_a', source: 'microphone', isLocal: true, speaking: true},
				1000 + tick * 1000,
			);
			participantAdapter.sweepNativeSpeakingHeartbeats(1000 + tick * 1000 + 500);
			expect(participantAdapter.getParticipant('user_1_a')?.isAudioLevelSpeaking).toBe(true);
		}
	});

	it('rejects native speaking samples from non-microphone tracks', () => {
		participantAdapter.upsertParticipantFromNative({identity: 'user_1_a', sid: 'PA_1', isLocal: true});
		expect(() =>
			participantAdapter.applyNativeSpeakingSample(
				{participantSid: 'PA_1', identity: 'user_1_a', source: 'screen_share_audio', isLocal: true, speaking: true},
				1000,
			),
		).toThrow();
		expect(participantAdapter.getParticipant('user_1_a')?.isAudioLevelSpeaking).toBe(false);
	});

	it('ignores native speaking samples for discarded connections', () => {
		participantAdapter.upsertParticipantFromNative({identity: 'user_1_staleConn', sid: 'PA_1'});
		participantAdapter.discardConnection('staleConn');
		participantAdapter.applyNativeSpeakingSample(
			{participantSid: 'PA_1', identity: 'user_1_staleConn', source: 'microphone', isLocal: false, speaking: true},
			1000,
		);
		expect(participantAdapter.getParticipant('user_1_staleConn')?.isAudioLevelSpeaking ?? false).toBe(false);
	});

	it('removeParticipantBySid removes the matching participant', () => {
		participantAdapter.upsertParticipantFromNative({identity: 'user_1_a', sid: 'PA_1'});
		participantAdapter.upsertParticipantFromNative({identity: 'user_2_b', sid: 'PA_2'});
		participantAdapter.removeParticipantBySid('PA_1');
		expect(participantAdapter.getParticipant('user_1_a')).toBeUndefined();
		expect(participantAdapter.getParticipant('user_2_b')).toBeDefined();
	});

	it('does not reinsert a discarded connection from late native participant events', () => {
		participantAdapter.upsertParticipantFromNative({identity: 'user_1_staleNativeConnection', sid: 'PA_1'});
		expect(participantAdapter.getParticipant('user_1_staleNativeConnection')).toBeDefined();

		participantAdapter.discardConnection('staleNativeConnection');
		expect(participantAdapter.getParticipant('user_1_staleNativeConnection')).toBeUndefined();

		participantAdapter.upsertParticipantFromNative({identity: 'user_1_staleNativeConnection', sid: 'PA_1'});
		participantAdapter.patchParticipantTrackFlags('user_1_staleNativeConnection', {isMicrophoneEnabled: true});

		expect(participantAdapter.getParticipant('user_1_staleNativeConnection')).toBeUndefined();
	});
});
