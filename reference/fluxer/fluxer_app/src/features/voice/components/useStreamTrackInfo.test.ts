// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	mergeStreamTrackInfo,
	resolveStreamTrackInfoSnapshot,
	resolveStreamTrackStatsInfo,
} from '@app/features/voice/components/useStreamTrackInfo';
import {createVoiceMediaGraphSnapshot, transitionVoiceMediaGraph} from '@app/features/voice/engine/VoiceMediaGraph';
import {
	type VoiceMediaGraphStatsView,
	voiceMediaGraphStatsObservationsFromNativeStats,
	voiceMediaGraphStatsObservationsFromPerTrackStats,
} from '@app/features/voice/engine/VoiceMediaGraphStats';
import {VoiceTrackSource} from '@app/features/voice/engine/VoiceTrackSource';
import type {VoiceEngineV2PerTrackStats, VoiceEngineV2Stats} from '@fluxer/voice_engine_v2';
import {describe, expect, it} from 'vitest';

function nativeStats(overrides: Partial<VoiceEngineV2Stats>): VoiceEngineV2Stats {
	return {rttMs: null, outbound: [], inbound: [], ...overrides};
}

function graphViewWithNativeStats(stats: VoiceEngineV2Stats): VoiceMediaGraphStatsView {
	return transitionVoiceMediaGraph(createVoiceMediaGraphSnapshot(), {
		type: 'stats.observed',
		at: 1000,
		connectionId: 'conn-1',
		platform: 'native',
		tracks: voiceMediaGraphStatsObservationsFromNativeStats(stats),
	});
}

function graphViewWithWebStats(tracks: ReadonlyArray<VoiceEngineV2PerTrackStats>): VoiceMediaGraphStatsView {
	return transitionVoiceMediaGraph(createVoiceMediaGraphSnapshot(), {
		type: 'stats.observed',
		at: 1000,
		connectionId: 'conn-1',
		platform: 'web',
		tracks: voiceMediaGraphStatsObservationsFromPerTrackStats(tracks),
	});
}

describe('resolveStreamTrackInfoSnapshot', () => {
	it('prefers attached element dimensions and rounds track settings fps', () => {
		expect(
			resolveStreamTrackInfoSnapshot({
				attachedElements: [{videoWidth: 3840, videoHeight: 2160}],
				settings: {width: 1280, height: 720, frameRate: 29.7},
			}),
		).toEqual({width: 3840, height: 2160, fps: 30});
	});
});

describe('mergeStreamTrackInfo', () => {
	it('fills missing rendered-track fps from matched stats without replacing rendered dimensions', () => {
		const renderedInfo = {width: 3840, height: 2160, fps: 0};
		const statsInfo = {width: 1920, height: 1080, fps: 24.7};

		expect(mergeStreamTrackInfo(renderedInfo, statsInfo)).toEqual({width: 3840, height: 2160, fps: 25});
	});
});

describe('resolveStreamTrackStatsInfo', () => {
	it('resolves native screen-share info from the graph by trackSid', () => {
		const view = graphViewWithNativeStats(
			nativeStats({
				outbound: [
					{
						trackSid: 'TR_screen',
						source: 'screen_share',
						kind: 'video',
						bitrateKbps: 2000,
						packetsLost: 0,
						width: 2560,
						height: 1440,
						fps: 30,
						effectiveFps: 59.6,
					},
				],
			}),
		);

		expect(
			resolveStreamTrackStatsInfo(view, {
				trackSid: 'TR_screen',
				source: VoiceTrackSource.ScreenShare,
				kind: 'video',
			}),
		).toEqual({width: 2560, height: 1440, fps: 59.6});
	});

	it('resolves remote native screen-share info via the participantIdentity fallback', () => {
		const view = graphViewWithNativeStats(
			nativeStats({
				inbound: [
					{
						participantSid: 'PA_1',
						participantIdentity: 'user_2_connection_2',
						trackSid: 'TR_remote_screen',
						source: 'screen_share',
						kind: 'video',
						bitrateKbps: 4200,
						packetsLost: 0,
						width: 3840,
						height: 2160,
						fps: 24.7,
					},
				],
			}),
		);

		expect(
			resolveStreamTrackStatsInfo(view, {
				participantIdentity: 'user_2_connection_2',
				source: VoiceTrackSource.ScreenShare,
				kind: 'video',
			}),
		).toEqual({width: 3840, height: 2160, fps: 24.7});
	});

	it('resolves web per-track stats dispatched into the graph by trackIdentifier', () => {
		const view = graphViewWithWebStats([
			{
				direction: 'recv',
				kind: 'video',
				trackIdentifier: 'camera-media-track',
				bitrateKbps: 800,
				framesPerSecond: 30,
			},
			{
				direction: 'recv',
				kind: 'video',
				trackIdentifier: 'screen-media-track',
				bitrateKbps: 4200,
				framesPerSecond: 24.7,
				frameWidth: 3840,
				frameHeight: 2160,
			},
		]);

		expect(
			resolveStreamTrackStatsInfo(view, {
				trackIdentifier: 'screen-media-track',
				source: VoiceTrackSource.ScreenShare,
				kind: 'video',
			}),
		).toEqual({width: 3840, height: 2160, fps: 24.7});
	});

	it('can return fps-only web stats so rendered dimensions still get the estimated frame rate', () => {
		const view = graphViewWithWebStats([
			{
				direction: 'recv',
				kind: 'video',
				trackIdentifier: 'screen-media-track',
				bitrateKbps: 4200,
				framesPerSecond: 25,
			},
		]);

		expect(
			resolveStreamTrackStatsInfo(view, {
				trackIdentifier: 'screen-media-track',
				source: VoiceTrackSource.ScreenShare,
				kind: 'video',
			}),
		).toEqual({fps: 25});
	});
});
