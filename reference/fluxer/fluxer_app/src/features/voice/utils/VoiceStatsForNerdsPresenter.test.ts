// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	buildVoiceStatsForNerdsPresentation,
	type ParticipantPublicationLookup,
} from '@app/features/voice/utils/VoiceStatsForNerdsPresenter';
import type {
	VoiceEngineV2PerTrackStats,
	VoiceEngineV2Stats,
	VoiceEngineV2StatsSample,
	VoiceEngineV2VoiceStats,
} from '@fluxer/voice_engine_v2';
import {describe, expect, it} from 'vitest';

function participant(publications: Record<string, string>): ParticipantPublicationLookup {
	return {
		getTrackPublication(source) {
			const trackId = publications[String(source)];
			if (!trackId) return undefined;
			const mediaStreamTrack = {id: trackId} as MediaStreamTrack;
			if (String(source) === 'camera' || String(source) === 'screen_share') {
				return {videoTrack: {mediaStreamTrack}};
			}
			if (String(source) === 'microphone' || String(source) === 'screen_share_audio') {
				return {audioTrack: {mediaStreamTrack}};
			}
			return {track: {mediaStreamTrack}};
		},
	};
}

function participantWithAudioPublications(
	publications: Record<string, string>,
	audioPublications: Array<{
		source: string;
		trackName?: string;
		trackId: string;
	}>,
): ParticipantPublicationLookup {
	const baseParticipant = participant(publications);
	return {
		getTrackPublication: baseParticipant.getTrackPublication,
		audioTrackPublications: new Map(
			audioPublications.map((publication) => [
				publication.trackId,
				{
					source: publication.source,
					trackName: publication.trackName,
					audioTrack: {
						mediaStreamTrack: {id: publication.trackId} as MediaStreamTrack,
					},
				},
			]),
		),
	};
}

const voiceStats: VoiceEngineV2VoiceStats = {
	audioSendBitrate: 48,
	audioRecvBitrate: 64,
	videoSendBitrate: 1200,
	videoRecvBitrate: 900,
	audioPacketLoss: 1.5,
	videoPacketLoss: 2.5,
	rtt: 37,
	jitter: 8,
	participantCount: 3,
	duration: 12,
};

const timeSeries: Array<VoiceEngineV2StatsSample> = [
	{
		timestamp: 1000,
		rtt: 31,
		jitter: 6,
		audioPacketLoss: 1,
		videoPacketLoss: 2,
		audioSendBitrate: 40,
		audioRecvBitrate: 50,
		videoSendBitrate: 600,
		videoRecvBitrate: 700,
	},
];

function nativeStats(overrides: Partial<VoiceEngineV2Stats>): VoiceEngineV2Stats {
	return {rttMs: null, outbound: [], inbound: [], ...overrides};
}

describe('buildVoiceStatsForNerdsPresentation', () => {
	it('classifies browser per-track stats once for overlay and copy consumers', () => {
		const localParticipant = participant({
			camera: 'local-camera',
			microphone: 'local-mic',
			screen_share: 'local-screen',
			screen_share_audio: 'local-screen-audio',
		});
		const remoteParticipant = participant({
			microphone: 'remote-mic',
			screen_share: 'remote-screen',
			screen_share_audio: 'remote-screen-audio',
		});
		const perTrackStats: Array<VoiceEngineV2PerTrackStats> = [
			{direction: 'send', kind: 'video', trackIdentifier: 'local-camera', bitrateKbps: 500},
			{direction: 'send', kind: 'audio', trackIdentifier: 'local-mic', bitrateKbps: 48},
			{direction: 'send', kind: 'video', trackIdentifier: 'local-screen', bitrateKbps: 1200},
			{direction: 'send', kind: 'audio', trackIdentifier: 'local-screen-audio', bitrateKbps: 96},
			{direction: 'recv', kind: 'audio', trackIdentifier: 'remote-mic', bitrateKbps: 64},
			{direction: 'recv', kind: 'video', trackIdentifier: 'remote-camera', bitrateKbps: 900},
			{direction: 'recv', kind: 'video', trackIdentifier: 'remote-screen', bitrateKbps: 1800},
			{direction: 'recv', kind: 'audio', trackIdentifier: 'remote-screen-audio', bitrateKbps: 128},
		];

		const presentation = buildVoiceStatsForNerdsPresentation({
			connectionId: 'connection-a',
			connectionQuality: 'excellent',
			currentLatency: 37,
			averageLatency: 41,
			stats: voiceStats,
			perTrackStats,
			statsTimeSeries: timeSeries,
			nativeStats: null,
			publisherTransport: null,
			subscriberTransport: null,
			localParticipant,
			remoteParticipants: [remoteParticipant],
		});

		expect(presentation.session).toMatchObject({
			connectionId: 'connection-a',
			connectionQuality: 'excellent',
			latencyMs: 37,
			avgLatencyMs: 41,
			durationSeconds: 12,
			participants: 3,
		});
		expect(presentation.localVideo?.trackIdentifier).toBe('local-camera');
		expect(presentation.localAudio?.trackIdentifier).toBe('local-mic');
		expect(presentation.localScreenShare?.trackIdentifier).toBe('local-screen');
		expect(presentation.localScreenShareAudio?.trackIdentifier).toBe('local-screen-audio');
		expect(presentation.remoteVideo?.trackIdentifier).toBe('remote-camera');
		expect(presentation.remoteAudio?.trackIdentifier).toBe('remote-mic');
		expect(presentation.remoteScreenShare?.trackIdentifier).toBe('remote-screen');
		expect(presentation.remoteScreenShareAudio?.trackIdentifier).toBe('remote-screen-audio');
		expect(presentation.network.audioSendBitrateKbps).toBe(48);
		expect(presentation.sparklines).toEqual({
			latency: [31],
			bitrate: [1390],
			packetLoss: [2],
		});
	});

	it('classifies native named screen-share audio publications when source lookup misses', () => {
		const remoteParticipant = participantWithAudioPublications(
			{
				screen_share: 'remote-screen',
			},
			[{source: 'microphone', trackName: 'screen-audio', trackId: 'remote-screen-audio'}],
		);
		const perTrackStats: Array<VoiceEngineV2PerTrackStats> = [
			{direction: 'recv', kind: 'audio', trackIdentifier: 'remote-screen-audio', bitrateKbps: 4},
			{direction: 'recv', kind: 'video', trackIdentifier: 'remote-screen', bitrateKbps: 1800},
		];

		const presentation = buildVoiceStatsForNerdsPresentation({
			connectionId: 'connection-a',
			connectionQuality: 'excellent',
			currentLatency: 37,
			averageLatency: 41,
			stats: voiceStats,
			perTrackStats,
			statsTimeSeries: timeSeries,
			nativeStats: null,
			publisherTransport: null,
			subscriberTransport: null,
			localParticipant: null,
			remoteParticipants: [remoteParticipant],
		});

		expect(presentation.remoteScreenShareAudio?.trackIdentifier).toBe('remote-screen-audio');
		expect(presentation.remoteAudio).toBeNull();
	});

	it('uses the canonical v2 native stats projection when native stats are available', () => {
		const perTrackStats: Array<VoiceEngineV2PerTrackStats> = [
			{direction: 'send', kind: 'video', trackIdentifier: 'browser-camera', bitrateKbps: 500},
			{direction: 'send', kind: 'audio', trackIdentifier: 'browser-mic', bitrateKbps: 48},
		];

		const presentation = buildVoiceStatsForNerdsPresentation({
			connectionId: 'connection-a',
			connectionQuality: 'excellent',
			currentLatency: 37,
			averageLatency: 41,
			stats: {
				...voiceStats,
				audioSendBitrate: 1,
				videoSendBitrate: 2,
				rtt: 999,
			},
			perTrackStats,
			statsTimeSeries: timeSeries,
			nativeStats: nativeStats({
				rttMs: 25,
				droppedNativeVideoFrames: 7,
				outbound: [
					{
						trackSid: 'native-camera',
						source: 'camera',
						kind: 'video',
						bitrateKbps: 700,
						packetsLost: 0,
						fps: 30,
					},
					{
						trackSid: 'native-screen-audio',
						source: 'screen_share_audio',
						kind: 'audio',
						bitrateKbps: 96,
						packetsLost: 1,
						packetsSent: 100,
					},
				],
				inbound: [
					{
						participantSid: 'remote-a',
						trackSid: 'native-remote-audio',
						kind: 'audio',
						bitrateKbps: 64,
						packetsLost: 3,
						packetsReceived: 97,
						jitterMs: 9,
					},
				],
			}),
			publisherTransport: null,
			subscriberTransport: null,
			localParticipant: null,
			remoteParticipants: null,
		});

		expect(presentation.network).toMatchObject({
			audioSendBitrateKbps: 96,
			audioRecvBitrateKbps: 64,
			videoSendBitrateKbps: 700,
			audioPacketLossPercent: 3,
			jitterMs: 9,
			rttMs: 25,
			droppedVideoFrameCallbacks: 7,
		});
		expect(presentation.localVideo?.trackIdentifier).toBe('native-camera');
		expect(presentation.localAudio).toBeNull();
		expect(presentation.localScreenShareAudio?.trackIdentifier).toBe('native-screen-audio');
		expect(presentation.remoteAudio?.trackIdentifier).toBe('native-remote-audio');
	});

	it('uses the tracked latency for native RTT when a sparse native stats sample omits RTT', () => {
		const presentation = buildVoiceStatsForNerdsPresentation({
			connectionId: 'connection-a',
			connectionQuality: 'excellent',
			currentLatency: 37,
			averageLatency: 41,
			stats: {
				...voiceStats,
				rtt: 999,
			},
			perTrackStats: [],
			statsTimeSeries: timeSeries,
			nativeStats: nativeStats({
				rttMs: null,
				outbound: [
					{
						trackSid: 'native-mic',
						source: 'microphone',
						kind: 'audio',
						bitrateKbps: 48,
						packetsLost: 0,
					},
				],
				inbound: [],
			}),
			publisherTransport: null,
			subscriberTransport: null,
			localParticipant: null,
			remoteParticipants: null,
		});

		expect(presentation.network.rttMs).toBe(37);
	});

	it('keeps native RTT unknown before the first tracked latency sample', () => {
		const presentation = buildVoiceStatsForNerdsPresentation({
			connectionId: 'connection-a',
			connectionQuality: 'excellent',
			currentLatency: null,
			averageLatency: null,
			stats: {
				...voiceStats,
				rtt: 999,
			},
			perTrackStats: [],
			statsTimeSeries: timeSeries,
			nativeStats: nativeStats({rttMs: null}),
			publisherTransport: null,
			subscriberTransport: null,
			localParticipant: null,
			remoteParticipants: null,
		});

		expect(presentation.network.rttMs).toBeNull();
	});
});
