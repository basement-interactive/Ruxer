// SPDX-License-Identifier: AGPL-3.0-or-later

import {SPEAKING_REMOTE_ATTACK_MS, SPEAKING_REMOTE_RELEASE_MS} from '@app/features/voice/engine/VoiceSpeakingThreshold';
import {
	VoiceConnectionQuality,
	type VoiceConnectionQuality as VoiceConnectionQualityType,
} from '@app/features/voice/engine/VoiceTrackSource';
import type {Participant, Room} from 'livekit-client';
import {describe, expect, it} from 'vitest';
import {
	createLivekitParticipantSnapshot,
	createLivekitParticipantSnapshotsFromRoom,
	createVoiceParticipantSnapshot,
	createVoiceRemoteSpeakingSnapshot,
	findParticipantSnapshotByUserIdAndConnectionId,
	transitionVoiceParticipantSnapshot,
	transitionVoiceRemoteSpeakingSnapshot,
	type VoiceRemoteSpeakingCommand,
	type VoiceRemoteSpeakingSnapshot,
} from './VoiceParticipantStateMachine';

const connectionQuality = VoiceConnectionQuality.Good;

function participant(
	identity: string,
	overrides: Omit<Partial<Participant>, 'connectionQuality'> & {
		connectionQuality?: VoiceConnectionQualityType;
		audioTrackSids?: ReadonlyArray<string>;
		videoTrackSids?: ReadonlyArray<string>;
	} = {},
): Participant {
	return {
		identity,
		sid: overrides.sid ?? `sid-${identity}`,
		isLocal: overrides.isLocal ?? false,
		isSpeaking: overrides.isSpeaking ?? false,
		connectionQuality: overrides.connectionQuality ?? connectionQuality,
		metadata: overrides.metadata,
		attributes: overrides.attributes ?? {},
		audioTrackPublications:
			overrides.audioTrackPublications ?? new Map((overrides.audioTrackSids ?? []).map((sid) => [sid, {}])),
		videoTrackPublications: new Map((overrides.videoTrackSids ?? []).map((sid) => [sid, {}])),
		isMicrophoneEnabled: overrides.isMicrophoneEnabled ?? false,
		isCameraEnabled: overrides.isCameraEnabled ?? false,
		isScreenShareEnabled: overrides.isScreenShareEnabled ?? false,
		joinedAt: overrides.joinedAt ?? null,
		lastSpokeAt: overrides.lastSpokeAt ?? null,
	} as Participant;
}

function room(localParticipant: Participant | null, remoteParticipants: ReadonlyArray<Participant>): Room {
	return {
		localParticipant,
		remoteParticipants: new Map(remoteParticipants.map((p) => [p.identity, p])),
	} as Room;
}

function commandsOf(snapshot: VoiceRemoteSpeakingSnapshot): ReadonlyArray<VoiceRemoteSpeakingCommand> {
	return snapshot.context.commands;
}

describe('VoiceParticipantStateMachine participants', () => {
	it('keeps participant snapshot references stable when an upsert is equal', () => {
		const p = participant('user_42_conn-a', {
			audioTrackSids: ['audio-b', 'audio-a'],
			videoTrackSids: ['video-a'],
			attributes: {role: 'speaker'},
			joinedAt: new Date(100),
		});
		let snapshot = createVoiceParticipantSnapshot();
		snapshot = transitionVoiceParticipantSnapshot(snapshot, {
			type: 'participant.upsert',
			snapshot: createLivekitParticipantSnapshot(p),
		});
		const participantsRef = snapshot.context.participants;
		const participantRef = snapshot.context.participants[p.identity];

		snapshot = transitionVoiceParticipantSnapshot(snapshot, {
			type: 'participant.upsert',
			snapshot: createLivekitParticipantSnapshot(
				participant('user_42_conn-a', {
					audioTrackSids: ['audio-b', 'audio-a'],
					videoTrackSids: ['video-a'],
					attributes: {role: 'speaker'},
					joinedAt: new Date(100),
				}),
			),
		});

		expect(snapshot.context.participants).toBe(participantsRef);
		expect(snapshot.context.participants[p.identity]).toBe(participantRef);
		expect(participantRef?.audioTrackSids).toEqual(['audio-a', 'audio-b']);
	});

	it('derives screen-share audio state from audio publications', () => {
		const p = participant('user_42_conn-a', {
			audioTrackPublications: new Map([
				[
					'screen-audio',
					{
						source: 'screen_share_audio',
						isMuted: false,
					},
				],
			]) as Participant['audioTrackPublications'],
		});

		expect(createLivekitParticipantSnapshot(p).isScreenShareAudioEnabled).toBe(true);
	});

	it('hydrates from the room and removes stale participants', () => {
		let snapshot = createVoiceParticipantSnapshot();
		const alice = participant('user_1_a');
		const bob = participant('user_2_b');
		snapshot = transitionVoiceParticipantSnapshot(snapshot, {
			type: 'participant.hydrate',
			snapshots: [createLivekitParticipantSnapshot(alice), createLivekitParticipantSnapshot(bob)],
		});

		const hydrated = createLivekitParticipantSnapshotsFromRoom(room(alice, []), snapshot.context.participants);
		snapshot = transitionVoiceParticipantSnapshot(snapshot, {type: 'participant.hydrate', snapshots: hydrated});

		expect(Object.keys(snapshot.context.participants)).toEqual(['user_1_a']);
		expect(snapshot.context.participants['user_1_a']).toBeDefined();
		expect(snapshot.context.participants['user_2_b']).toBeUndefined();
	});

	it('parses multiple connections for the same user identity independently', () => {
		let snapshot = createVoiceParticipantSnapshot();
		for (const p of [participant('user_99_desktop'), participant('user_99_mobile')]) {
			snapshot = transitionVoiceParticipantSnapshot(snapshot, {
				type: 'participant.upsert',
				snapshot: createLivekitParticipantSnapshot(p),
			});
		}

		expect(
			findParticipantSnapshotByUserIdAndConnectionId(snapshot.context.participants, '99', 'desktop')?.identity,
		).toBe('user_99_desktop');
		expect(
			findParticipantSnapshotByUserIdAndConnectionId(snapshot.context.participants, '99', 'mobile')?.identity,
		).toBe('user_99_mobile');
		expect(findParticipantSnapshotByUserIdAndConnectionId(snapshot.context.participants, '99', null)).toBeUndefined();
	});

	it('diffs active speaker updates without creating missing participants', () => {
		let snapshot = createVoiceParticipantSnapshot();
		for (const p of [participant('user_1_a'), participant('user_2_b')]) {
			snapshot = transitionVoiceParticipantSnapshot(snapshot, {
				type: 'participant.upsert',
				snapshot: createLivekitParticipantSnapshot(p),
			});
		}
		snapshot = transitionVoiceParticipantSnapshot(snapshot, {
			type: 'participant.activeSpeakers',
			identities: ['user_1_a', 'user_3_c'],
		});

		expect(snapshot.context.participants['user_1_a']?.isSpeaking).toBe(true);
		expect(snapshot.context.participants['user_2_b']?.isSpeaking).toBe(false);
		expect(snapshot.context.participants['user_3_c']).toBeUndefined();

		snapshot = transitionVoiceParticipantSnapshot(snapshot, {
			type: 'participant.activeSpeakers',
			identities: ['user_2_b'],
		});
		expect(snapshot.context.participants['user_1_a']?.isSpeaking).toBe(false);
		expect(snapshot.context.participants['user_2_b']?.isSpeaking).toBe(true);
	});

	it('records lastSpokeAt from audio-level speaking updates', () => {
		let snapshot = createVoiceParticipantSnapshot();
		snapshot = transitionVoiceParticipantSnapshot(snapshot, {
			type: 'participant.upsert',
			snapshot: createLivekitParticipantSnapshot(participant('user_1_a')),
		});
		snapshot = transitionVoiceParticipantSnapshot(snapshot, {
			type: 'participant.setAudioLevelSpeaking',
			identity: 'user_1_a',
			speaking: true,
			nowMs: 1234,
		});
		expect(snapshot.context.participants['user_1_a']?.isAudioLevelSpeaking).toBe(true);
		expect(snapshot.context.participants['user_1_a']?.lastSpokeAt).toBe(1234);
		snapshot = transitionVoiceParticipantSnapshot(snapshot, {
			type: 'participant.upsert',
			snapshot: createLivekitParticipantSnapshot(
				participant('user_1_a', {lastSpokeAt: new Date(9999)}),
				snapshot.context.participants['user_1_a'],
			),
		});
		expect(snapshot.context.participants['user_1_a']?.lastSpokeAt).toBe(1234);
		snapshot = transitionVoiceParticipantSnapshot(snapshot, {
			type: 'participant.setAudioLevelSpeaking',
			identity: 'user_1_a',
			speaking: false,
			nowMs: 2000,
		});
		expect(snapshot.context.participants['user_1_a']?.isAudioLevelSpeaking).toBe(false);
		expect(snapshot.context.participants['user_1_a']?.lastSpokeAt).toBe(1234);
	});
});

describe('VoiceParticipantStateMachine remote speaking', () => {
	it('applies attack and release timing for audio-level speaking', () => {
		const track = {};
		const threshold = 0.015;
		let snapshot = createVoiceRemoteSpeakingSnapshot();
		snapshot = transitionVoiceRemoteSpeakingSnapshot(snapshot, {type: 'remote.attach', identity: 'user_1_a', track});
		snapshot = transitionVoiceRemoteSpeakingSnapshot(snapshot, {type: 'remote.clearCommands'});

		snapshot = transitionVoiceRemoteSpeakingSnapshot(snapshot, {
			type: 'remote.tick',
			identity: 'user_1_a',
			rms: 0.02,
			threshold,
			nowMs: 0,
		});
		expect(commandsOf(snapshot).some((command) => command.type === 'setAudioLevelSpeaking')).toBe(false);
		snapshot = transitionVoiceRemoteSpeakingSnapshot(snapshot, {type: 'remote.clearCommands'});

		snapshot = transitionVoiceRemoteSpeakingSnapshot(snapshot, {
			type: 'remote.tick',
			identity: 'user_1_a',
			rms: 0.02,
			threshold,
			nowMs: SPEAKING_REMOTE_ATTACK_MS + 1,
		});
		expect(commandsOf(snapshot)).toContainEqual({type: 'setAudioLevelSpeaking', identity: 'user_1_a', speaking: true});
		snapshot = transitionVoiceRemoteSpeakingSnapshot(snapshot, {type: 'remote.clearCommands'});

		snapshot = transitionVoiceRemoteSpeakingSnapshot(snapshot, {
			type: 'remote.tick',
			identity: 'user_1_a',
			rms: 0,
			threshold,
			nowMs: 100,
		});
		expect(commandsOf(snapshot).some((command) => command.type === 'setAudioLevelSpeaking')).toBe(false);
		snapshot = transitionVoiceRemoteSpeakingSnapshot(snapshot, {type: 'remote.clearCommands'});

		snapshot = transitionVoiceRemoteSpeakingSnapshot(snapshot, {
			type: 'remote.tick',
			identity: 'user_1_a',
			rms: 0,
			threshold,
			nowMs: 100 + SPEAKING_REMOTE_RELEASE_MS + 1,
		});
		expect(commandsOf(snapshot)).toContainEqual({type: 'setAudioLevelSpeaking', identity: 'user_1_a', speaking: false});
	});

	it('detaches and clears remote state when a track ends', () => {
		let snapshot = createVoiceRemoteSpeakingSnapshot();
		snapshot = transitionVoiceRemoteSpeakingSnapshot(snapshot, {
			type: 'remote.attach',
			identity: 'user_1_a',
			track: {},
		});
		snapshot = transitionVoiceRemoteSpeakingSnapshot(snapshot, {type: 'remote.clearCommands'});

		snapshot = transitionVoiceRemoteSpeakingSnapshot(snapshot, {
			type: 'remote.tick',
			identity: 'user_1_a',
			rms: 0,
			threshold: 0,
			nowMs: 10,
			trackEnded: true,
		});

		expect(snapshot.context.analysers.has('user_1_a')).toBe(false);
		expect(commandsOf(snapshot)).toEqual([
			{type: 'setAudioLevelSpeaking', identity: 'user_1_a', speaking: false},
			{type: 'clearPlaybackBoost', identity: 'user_1_a'},
		]);
	});

	it('suspends on visibility hide and requests rehydrate on show', () => {
		let snapshot = createVoiceRemoteSpeakingSnapshot();
		snapshot = transitionVoiceRemoteSpeakingSnapshot(snapshot, {
			type: 'remote.attach',
			identity: 'user_1_a',
			track: {},
		});
		snapshot = transitionVoiceRemoteSpeakingSnapshot(snapshot, {
			type: 'remote.attach',
			identity: 'user_2_b',
			track: {},
		});
		snapshot = transitionVoiceRemoteSpeakingSnapshot(snapshot, {type: 'remote.clearCommands'});

		snapshot = transitionVoiceRemoteSpeakingSnapshot(snapshot, {type: 'remote.visibilityHidden'});
		expect(snapshot.context.analyserSuspendedByVisibility).toBe(true);
		expect(snapshot.context.analysers.size).toBe(0);
		expect(commandsOf(snapshot)).toEqual([
			{type: 'setAudioLevelSpeaking', identity: 'user_1_a', speaking: false},
			{type: 'clearPlaybackBoost', identity: 'user_1_a'},
			{type: 'setAudioLevelSpeaking', identity: 'user_2_b', speaking: false},
			{type: 'clearPlaybackBoost', identity: 'user_2_b'},
		]);

		snapshot = transitionVoiceRemoteSpeakingSnapshot(snapshot, {type: 'remote.clearCommands'});
		snapshot = transitionVoiceRemoteSpeakingSnapshot(snapshot, {type: 'remote.visibilityVisible'});
		expect(snapshot.context.analyserSuspendedByVisibility).toBe(false);
		expect(commandsOf(snapshot)).toEqual([{type: 'rehydrateRemoteAnalysers'}]);
	});

	it('resets playback boost after quiet audio and on detach', () => {
		let snapshot = createVoiceRemoteSpeakingSnapshot();
		snapshot = transitionVoiceRemoteSpeakingSnapshot(snapshot, {
			type: 'remote.attach',
			identity: 'user_1_a',
			track: {},
		});
		expect(commandsOf(snapshot)).toEqual([{type: 'setPlaybackBoost', identity: 'user_1_a', boost: 1}]);
		snapshot = transitionVoiceRemoteSpeakingSnapshot(snapshot, {type: 'remote.clearCommands'});

		snapshot = transitionVoiceRemoteSpeakingSnapshot(snapshot, {
			type: 'remote.tick',
			identity: 'user_1_a',
			rms: 0.006,
			threshold: 1,
			nowMs: 10,
		});
		expect(commandsOf(snapshot)[0]).toMatchObject({type: 'setPlaybackBoost', identity: 'user_1_a'});
		expect(snapshot.context.analysers.get('user_1_a')?.playbackBoost).toBeGreaterThan(1);
		snapshot = transitionVoiceRemoteSpeakingSnapshot(snapshot, {type: 'remote.clearCommands'});

		snapshot = transitionVoiceRemoteSpeakingSnapshot(snapshot, {
			type: 'remote.tick',
			identity: 'user_1_a',
			rms: 0,
			threshold: 1,
			nowMs: 20,
		});
		expect(commandsOf(snapshot)).toEqual([{type: 'clearPlaybackBoost', identity: 'user_1_a'}]);
		expect(snapshot.context.analysers.get('user_1_a')?.playbackBoost).toBe(1);

		snapshot = transitionVoiceRemoteSpeakingSnapshot(snapshot, {type: 'remote.clearCommands'});
		snapshot = transitionVoiceRemoteSpeakingSnapshot(snapshot, {type: 'remote.detach', identity: 'user_1_a'});
		expect(commandsOf(snapshot)).toEqual([
			{type: 'setAudioLevelSpeaking', identity: 'user_1_a', speaking: false},
			{type: 'clearPlaybackBoost', identity: 'user_1_a'},
		]);
	});

	it('clears stale speaking flags after detach and clear', () => {
		let snapshot = createVoiceRemoteSpeakingSnapshot();
		snapshot = transitionVoiceRemoteSpeakingSnapshot(snapshot, {
			type: 'remote.attach',
			identity: 'user_1_a',
			track: {},
		});
		snapshot = transitionVoiceRemoteSpeakingSnapshot(snapshot, {type: 'remote.clearCommands'});
		snapshot = transitionVoiceRemoteSpeakingSnapshot(snapshot, {
			type: 'remote.tick',
			identity: 'user_1_a',
			rms: 0.02,
			threshold: 0.015,
			nowMs: 0,
		});
		snapshot = transitionVoiceRemoteSpeakingSnapshot(snapshot, {
			type: 'remote.tick',
			identity: 'user_1_a',
			rms: 0.02,
			threshold: 0.015,
			nowMs: SPEAKING_REMOTE_ATTACK_MS + 1,
		});
		snapshot = transitionVoiceRemoteSpeakingSnapshot(snapshot, {type: 'remote.clearCommands'});
		snapshot = transitionVoiceRemoteSpeakingSnapshot(snapshot, {type: 'remote.detach', identity: 'user_1_a'});
		expect(commandsOf(snapshot)).toContainEqual({type: 'setAudioLevelSpeaking', identity: 'user_1_a', speaking: false});

		snapshot = transitionVoiceRemoteSpeakingSnapshot(snapshot, {type: 'remote.clearCommands'});
		snapshot = transitionVoiceRemoteSpeakingSnapshot(snapshot, {
			type: 'remote.attach',
			identity: 'user_1_a',
			track: {},
		});
		snapshot = transitionVoiceRemoteSpeakingSnapshot(snapshot, {
			type: 'remote.attach',
			identity: 'user_2_b',
			track: {},
		});
		snapshot = transitionVoiceRemoteSpeakingSnapshot(snapshot, {type: 'remote.clearCommands'});
		for (const identity of ['user_1_a', 'user_2_b']) {
			snapshot = transitionVoiceRemoteSpeakingSnapshot(snapshot, {
				type: 'remote.tick',
				identity,
				rms: 0.02,
				threshold: 0.015,
				nowMs: 0,
			});
			snapshot = transitionVoiceRemoteSpeakingSnapshot(snapshot, {
				type: 'remote.tick',
				identity,
				rms: 0.02,
				threshold: 0.015,
				nowMs: SPEAKING_REMOTE_ATTACK_MS + 1,
			});
		}
		snapshot = transitionVoiceRemoteSpeakingSnapshot(snapshot, {type: 'remote.clearCommands'});
		snapshot = transitionVoiceRemoteSpeakingSnapshot(snapshot, {type: 'remote.clear'});
		expect(commandsOf(snapshot)).toEqual([
			{type: 'setAudioLevelSpeaking', identity: 'user_1_a', speaking: false},
			{type: 'clearPlaybackBoost', identity: 'user_1_a'},
			{type: 'setAudioLevelSpeaking', identity: 'user_2_b', speaking: false},
			{type: 'clearPlaybackBoost', identity: 'user_2_b'},
		]);
		expect(snapshot.context.analysers.size).toBe(0);
	});
});
