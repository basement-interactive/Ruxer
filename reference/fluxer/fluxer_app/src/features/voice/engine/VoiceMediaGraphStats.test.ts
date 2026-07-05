// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	createVoiceMediaGraphSnapshot,
	transitionVoiceMediaGraph,
	type VoiceMediaGraphSnapshot,
} from '@app/features/voice/engine/VoiceMediaGraph';
import {
	buildVoiceMediaGraphStatsView,
	selectVoiceMediaGraphStreamTrackInfo,
	voiceMediaGraphStatsObservationsFromNativeStats,
	voiceMediaGraphStatsObservationsFromPerTrackStats,
} from '@app/features/voice/engine/VoiceMediaGraphStats';
import type {VoiceMediaGraphStatsTrackObservation} from '@app/features/voice/engine/VoiceMediaGraphStatsObservations';
import type {VoiceEngineV2PerTrackStats, VoiceEngineV2Stats} from '@fluxer/voice_engine_v2';
import {describe, expect, it} from 'vitest';

function nativeStats(overrides: Partial<VoiceEngineV2Stats>): VoiceEngineV2Stats {
	return {rttMs: null, outbound: [], inbound: [], ...overrides};
}

function observation(overrides: Partial<VoiceMediaGraphStatsTrackObservation>): VoiceMediaGraphStatsTrackObservation {
	return {
		trackSid: null,
		trackIdentifier: null,
		mediaSourceId: null,
		mid: null,
		rid: null,
		ssrc: null,
		participantIdentity: null,
		participantSid: null,
		source: null,
		direction: 'recv',
		kind: 'video',
		fps: null,
		width: null,
		height: null,
		sourceFps: null,
		sourceWidth: null,
		sourceHeight: null,
		...overrides,
	};
}

function snapshotWithObservations(
	connectionId: string,
	platform: 'native' | 'web',
	tracks: ReadonlyArray<VoiceMediaGraphStatsTrackObservation>,
): VoiceMediaGraphSnapshot {
	return transitionVoiceMediaGraph(createVoiceMediaGraphSnapshot(), {
		type: 'stats.observed',
		at: 1000,
		connectionId,
		platform,
		tracks,
	});
}

describe('voiceMediaGraphStatsObservationsFromNativeStats', () => {
	it('normalizes outbound and inbound native tracks with multi-key identity', () => {
		const observations = voiceMediaGraphStatsObservationsFromNativeStats(
			nativeStats({
				outbound: [
					{
						trackSid: 'TR_local_screen',
						source: 'screen_share',
						kind: 'video',
						bitrateKbps: 2000,
						packetsLost: 0,
						width: 2560,
						height: 1440,
						fps: 30,
						effectiveFps: 59.6,
						sourceWidth: 3840,
						sourceHeight: 2160,
					},
				],
				inbound: [
					{
						participantIdentity: 'user_2_conn_2',
						participantSid: 'PA_2',
						trackSid: 'TR_remote_screen',
						source: 'screen_share',
						kind: 'video',
						bitrateKbps: 4200,
						packetsLost: 0,
						width: 1920,
						height: 1080,
						fps: 24.7,
					},
				],
			}),
		);

		expect(observations).toEqual([
			observation({
				trackSid: 'TR_local_screen',
				source: 'screen_share',
				direction: 'send',
				fps: 59.6,
				width: 2560,
				height: 1440,
				sourceWidth: 3840,
				sourceHeight: 2160,
			}),
			observation({
				trackSid: 'TR_remote_screen',
				participantIdentity: 'user_2_conn_2',
				participantSid: 'PA_2',
				source: 'screen_share',
				direction: 'recv',
				fps: 24.7,
				width: 1920,
				height: 1080,
			}),
		]);
	});
});

describe('voiceMediaGraphStatsObservationsFromNativeStats local identity stamping', () => {
	it('stamps the local participant identity onto an outbound ScreenShare video observation', () => {
		const observations = voiceMediaGraphStatsObservationsFromNativeStats(
			nativeStats({
				outbound: [
					{
						trackSid: 'TR_local_screen',
						source: 'screen_share',
						kind: 'video',
						bitrateKbps: 2000,
						packetsLost: 0,
						width: 2560,
						height: 1440,
						effectiveFps: 30,
					},
				],
			}),
			'user_1_conn_1',
		);

		expect(observations[0]?.participantIdentity).toBe('user_1_conn_1');
		expect(observations[0]?.direction).toBe('send');
		expect(observations[0]?.source).toBe('screen_share');
	});

	it('does not stamp the local identity onto an outbound camera observation', () => {
		const observations = voiceMediaGraphStatsObservationsFromNativeStats(
			nativeStats({
				outbound: [
					{
						trackSid: 'TR_local_camera',
						source: 'camera',
						kind: 'video',
						bitrateKbps: 600,
						packetsLost: 0,
						width: 640,
						height: 480,
						effectiveFps: 24,
					},
				],
			}),
			'user_1_conn_1',
		);

		expect(observations[0]?.participantIdentity).toBeNull();
	});

	it('matches the self-tile pill target via the participantIdentity fallback for outbound ScreenShare', () => {
		const snapshot = snapshotWithObservations(
			'conn-1',
			'native',
			voiceMediaGraphStatsObservationsFromNativeStats(
				nativeStats({
					outbound: [
						{
							trackSid: 'TR_local_screen',
							source: 'screen_share',
							kind: 'video',
							bitrateKbps: 2000,
							packetsLost: 0,
							width: 2560,
							height: 1440,
							effectiveFps: 30,
						},
						{
							trackSid: 'TR_local_camera',
							source: 'camera',
							kind: 'video',
							bitrateKbps: 600,
							packetsLost: 0,
							width: 640,
							height: 480,
							effectiveFps: 24,
						},
					],
				}),
				'user_1_conn_1',
			),
		);

		expect(
			selectVoiceMediaGraphStreamTrackInfo(snapshot, {
				trackSid: 'TR_synthetic_preview',
				participantIdentity: 'user_1_conn_1',
				source: 'screen_share',
				kind: 'video',
			}),
		).toEqual({width: 2560, height: 1440, fps: 30});
	});

	it('does not return an outbound camera observation for a ScreenShare participant target', () => {
		const snapshot = snapshotWithObservations(
			'conn-1',
			'native',
			voiceMediaGraphStatsObservationsFromNativeStats(
				nativeStats({
					outbound: [
						{
							trackSid: 'TR_local_camera',
							source: 'camera',
							kind: 'video',
							bitrateKbps: 600,
							packetsLost: 0,
							width: 640,
							height: 480,
							effectiveFps: 24,
						},
					],
				}),
				'user_1_conn_1',
			),
		);

		expect(
			selectVoiceMediaGraphStreamTrackInfo(snapshot, {
				trackSid: 'TR_synthetic_preview',
				participantIdentity: 'user_1_conn_1',
				source: 'screen_share',
				kind: 'video',
			}),
		).toBeNull();
	});
});

describe('voiceMediaGraphStatsObservationsFromPerTrackStats', () => {
	it('normalizes web per-track stats and skips unknown kinds', () => {
		const tracks: Array<VoiceEngineV2PerTrackStats> = [
			{
				direction: 'recv',
				kind: 'video',
				trackIdentifier: 'screen-media-track',
				mediaSourceId: 'media-source-1',
				mid: '4',
				rid: 'f',
				ssrc: 1234,
				bitrateKbps: 4200,
				framesPerSecond: 24.7,
				frameWidth: 3840,
				frameHeight: 2160,
				sourceFramesPerSecond: 60,
			},
			{direction: 'recv', kind: 'unknown', bitrateKbps: 0},
		];

		expect(voiceMediaGraphStatsObservationsFromPerTrackStats(tracks)).toEqual([
			observation({
				trackIdentifier: 'screen-media-track',
				mediaSourceId: 'media-source-1',
				mid: '4',
				rid: 'f',
				ssrc: 1234,
				fps: 24.7,
				width: 3840,
				height: 2160,
				sourceFps: 60,
			}),
		]);
	});
});

describe('selectVoiceMediaGraphStreamTrackInfo', () => {
	it('matches on trackSid before any other key', () => {
		const snapshot = snapshotWithObservations('conn-1', 'native', [
			observation({trackSid: 'TR_a', rid: 'f', width: 1280, height: 720, fps: 15}),
			observation({trackSid: 'TR_b', width: 1920, height: 1080, fps: 30}),
		]);

		expect(selectVoiceMediaGraphStreamTrackInfo(snapshot, {trackSid: 'TR_b', rid: 'f', kind: 'video'})).toEqual({
			width: 1920,
			height: 1080,
			fps: 30,
		});
	});

	it('falls back to rid when no track identifier matches', () => {
		const snapshot = snapshotWithObservations('conn-1', 'web', [
			observation({rid: 'h', width: 1280, height: 720, fps: 20}),
			observation({rid: 'f', width: 1920, height: 1080, fps: 30}),
		]);

		expect(selectVoiceMediaGraphStreamTrackInfo(snapshot, {trackSid: 'TR_missing', rid: 'f', kind: 'video'})).toEqual({
			width: 1920,
			height: 1080,
			fps: 30,
		});
	});

	it('falls back to participantIdentity with strict source matching', () => {
		const snapshot = snapshotWithObservations('conn-1', 'native', [
			observation({
				trackSid: 'TR_camera',
				participantIdentity: 'user_2_conn_2',
				source: 'camera',
				width: 640,
				height: 480,
				fps: 24,
			}),
			observation({
				trackSid: 'TR_screen',
				participantIdentity: 'user_2_conn_2',
				source: 'screen_share',
				width: 3840,
				height: 2160,
				fps: 25,
			}),
		]);

		expect(
			selectVoiceMediaGraphStreamTrackInfo(snapshot, {
				trackSid: 'TR_missing',
				participantIdentity: 'user_2_conn_2',
				source: 'screen_share',
				kind: 'video',
			}),
		).toEqual({width: 3840, height: 2160, fps: 25});
	});

	it('does not match sourceless observations through the participantIdentity fallback', () => {
		const snapshot = snapshotWithObservations('conn-1', 'web', [observation({width: 640, height: 480, fps: 24})]);

		expect(
			selectVoiceMediaGraphStreamTrackInfo(snapshot, {
				participantIdentity: 'user_2_conn_2',
				source: 'screen_share',
				kind: 'video',
			}),
		).toBeNull();
	});

	it('uses source dimensions and fps when encoded values are absent', () => {
		const snapshot = snapshotWithObservations('conn-1', 'web', [
			observation({trackIdentifier: 'screen-media-track', sourceWidth: 2560, sourceHeight: 1440, sourceFps: 60}),
		]);

		expect(
			selectVoiceMediaGraphStreamTrackInfo(snapshot, {trackIdentifier: 'screen-media-track', kind: 'video'}),
		).toEqual({width: 2560, height: 1440, fps: 60});
	});

	it('returns identical info for equivalent native and web observations', () => {
		const nativeSnapshot = snapshotWithObservations(
			'conn-1',
			'native',
			voiceMediaGraphStatsObservationsFromNativeStats(
				nativeStats({
					inbound: [
						{
							participantIdentity: 'user_2_conn_2',
							trackSid: 'TR_remote_screen',
							source: 'screen_share',
							kind: 'video',
							bitrateKbps: 4200,
							packetsLost: 0,
							width: 1920,
							height: 1080,
							fps: 30,
						},
					],
				}),
			),
		);
		const webSnapshot = snapshotWithObservations(
			'conn-1',
			'web',
			voiceMediaGraphStatsObservationsFromPerTrackStats([
				{
					direction: 'recv',
					kind: 'video',
					trackIdentifier: 'TR_remote_screen',
					bitrateKbps: 4200,
					framesPerSecond: 30,
					frameWidth: 1920,
					frameHeight: 1080,
				},
			]),
		);
		const target = {trackSid: 'TR_remote_screen', source: 'screen_share', kind: 'video'} as const;

		expect(selectVoiceMediaGraphStreamTrackInfo(nativeSnapshot, target)).toEqual(
			selectVoiceMediaGraphStreamTrackInfo(webSnapshot, target),
		);
		expect(selectVoiceMediaGraphStreamTrackInfo(nativeSnapshot, target)).toEqual({
			width: 1920,
			height: 1080,
			fps: 30,
		});
	});

	it('drops observations for a stale connectionId', () => {
		const snapshot = snapshotWithObservations('conn-1', 'native', [
			observation({trackSid: 'TR_a', width: 1920, height: 1080, fps: 30}),
		]);
		const next = transitionVoiceMediaGraph(snapshot, {
			type: 'stats.observed',
			at: 2000,
			connectionId: 'conn-2',
			platform: 'native',
			tracks: [observation({trackSid: 'TR_b', width: 1280, height: 720, fps: 15})],
		});

		expect(next).toBe(snapshot);
		expect(selectVoiceMediaGraphStreamTrackInfo(next, {trackSid: 'TR_b', kind: 'video'})).toBeNull();
	});

	it('wipes stale entries when the stats connection changes', () => {
		const snapshot = snapshotWithObservations('conn-1', 'native', [
			observation({trackSid: 'TR_a', width: 1920, height: 1080, fps: 30}),
		]);
		const next = transitionVoiceMediaGraph(snapshot, {type: 'stats.connectionChanged', connectionId: 'conn-2'});

		expect(next.statsConnectionId).toBe('conn-2');
		expect(selectVoiceMediaGraphStreamTrackInfo(next, {trackSid: 'TR_a', kind: 'video'})).toBeNull();
	});

	it('resolves from an ad-hoc stats view built from observations', () => {
		const view = buildVoiceMediaGraphStatsView(
			[observation({trackIdentifier: 'screen-media-track', width: 1920, height: 1080, fps: 30})],
			'web',
			0,
			'fallback',
		);

		expect(selectVoiceMediaGraphStreamTrackInfo(view, {trackIdentifier: 'screen-media-track', kind: 'video'})).toEqual({
			width: 1920,
			height: 1080,
			fps: 30,
		});
	});
});
