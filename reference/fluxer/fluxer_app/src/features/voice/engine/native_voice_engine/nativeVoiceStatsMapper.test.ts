// SPDX-License-Identifier: AGPL-3.0-or-later

import {mapNativeStatsToOverrides} from '@app/features/voice/engine/native_voice_engine/nativeVoiceStatsMapper';
import type {VoiceEngineV2Stats} from '@fluxer/voice_engine_v2';
import {coerceVoiceEngineV2BridgeStats} from '@fluxer/voice_engine_v2/bridge';
import {describe, expect, it} from 'vitest';

function stats(overrides: Partial<VoiceEngineV2Stats>): VoiceEngineV2Stats {
	return {rttMs: null, outbound: [], inbound: [], ...overrides};
}

describe('mapNativeStatsToOverrides', () => {
	it('splits outbound video into camera vs screen share by source', () => {
		const result = mapNativeStatsToOverrides(
			stats({
				outbound: [
					{trackSid: 'cam', source: 'camera', kind: 'video', bitrateKbps: 500, packetsLost: 0, fps: 30},
					{trackSid: 'ss', source: 'screen_share', kind: 'video', bitrateKbps: 3000, packetsLost: 1, fps: 60},
				],
			}),
		);
		expect(result.localVideo?.trackIdentifier).toBe('cam');
		expect(result.localVideo?.framesPerSecond).toBe(30);
		expect(result.localScreenShare?.trackIdentifier).toBe('ss');
		expect(result.localScreenShare?.framesPerSecond).toBe(60);
		expect(result.network.videoSendBitrateKbps).toBe(3500);
	});

	it('treats screenshare (no underscore) as a screen-share source too', () => {
		const result = mapNativeStatsToOverrides(
			stats({
				outbound: [{trackSid: 'ss', source: 'screenshare', kind: 'video', bitrateKbps: 1000, packetsLost: 0}],
			}),
		);
		expect(result.localScreenShare?.trackIdentifier).toBe('ss');
		expect(result.localVideo).toBeNull();
	});

	it('preserves native screen-share codec, dimensions, fps, and frame diagnostics from raw stats payloads', () => {
		const result = mapNativeStatsToOverrides(
			coerceVoiceEngineV2BridgeStats({
				rttMs: 1,
				outbound: [
					{
						trackSid: 'TR_screen',
						source: 'screenshare',
						kind: 'video',
						codec: 'video/H265',
						bitrateKbps: 2500,
						packetsLost: 0,
						fps: 14,
						width: 1280,
						height: 720,
						sourceWidth: 2176,
						sourceHeight: 1200,
						targetBitrateKbps: 50000,
						configuredFps: 60,
						targetFps: 60,
						effectiveFps: 58.7,
						framesProduced: 120,
						framesAccepted: 119,
						framesDropped: 1,
						framesCoalesced: 0,
						framesCaptured: 118,
						captureFailures: 0,
						maxQueueAgeMs: 12.5,
						maxPushLatencyMs: 8.25,
						adaptiveSendTier: 'full',
						adaptiveSendReason: 'disabled',
					},
				],
			}),
		);
		expect(result.localScreenShare).toMatchObject({
			trackIdentifier: 'TR_screen',
			codec: 'video/H265',
			framesPerSecond: 58.7,
			configuredFramesPerSecond: 60,
			targetFramesPerSecond: 60,
			effectiveFramesPerSecond: 58.7,
			frameWidth: 1280,
			frameHeight: 720,
			sourceFrameWidth: 2176,
			sourceFrameHeight: 1200,
			targetBitrateKbps: 50000,
			framesProduced: 120,
			framesAccepted: 119,
			framesDropped: 1,
			framesCaptured: 118,
			maxQueueAgeMs: 12.5,
			maxPushLatencyMs: 8.25,
			adaptiveSendTier: 'full',
			adaptiveSendReason: 'disabled',
		});
	});

	it('coalesces native outbound rows for one screen-share publication before selecting the local screen-share row', () => {
		const result = mapNativeStatsToOverrides(
			stats({
				outbound: [
					{
						trackSid: 'TR_screen',
						source: 'screen_share',
						kind: 'video',
						codec: 'video/H265',
						bitrateKbps: 269.9,
						packetsLost: 0,
						fps: 3,
						effectiveFps: 53.9,
						configuredFps: 60,
						targetFps: 60,
						width: 2176,
						height: 1200,
						sourceWidth: 2176,
						sourceHeight: 1200,
						targetBitrateKbps: 50_000,
						framesProduced: 1904,
						framesAccepted: 1904,
						framesDropped: 64,
						framesCoalesced: 64,
						framesCaptured: 1839,
						captureFailures: 0,
						maxQueueAgeMs: 18,
						maxPushLatencyMs: 18,
						adaptiveSendTier: 'full',
						adaptiveSendReason: 'adaptiveDisabled',
					},
					{
						trackSid: 'TR_screen',
						source: 'screenshare',
						kind: 'video',
						codec: 'video/H265',
						bitrateKbps: 4614.1,
						packetsLost: 0,
						fps: 30,
					},
				],
			}),
		);
		expect(result.network.videoSendBitrateKbps).toBe(4884);
		expect(result.localScreenShare).toMatchObject({
			trackIdentifier: 'TR_screen',
			codec: 'video/H265',
			bitrateKbps: 4884,
			framesPerSecond: 53.9,
			effectiveFramesPerSecond: 53.9,
			configuredFramesPerSecond: 60,
			targetFramesPerSecond: 60,
			frameWidth: 2176,
			frameHeight: 1200,
			targetBitrateKbps: 50_000,
			adaptiveSendTier: 'full',
			adaptiveSendReason: 'adaptiveDisabled',
		});
		expect(result.perTrackStats).toContainEqual(expect.objectContaining({trackIdentifier: 'TR_screen'}));
	});

	it('splits native screen-share audio from microphone audio', () => {
		const result = mapNativeStatsToOverrides(
			stats({
				outbound: [
					{trackSid: 'mic', source: 'microphone', kind: 'audio', bitrateKbps: 48, packetsLost: 0},
					{trackSid: 'ss-audio', source: 'screen_share_audio', kind: 'audio', bitrateKbps: 96, packetsLost: 0},
				],
			}),
		);
		expect(result.localAudio?.trackIdentifier).toBe('mic');
		expect(result.localScreenShareAudio?.trackIdentifier).toBe('ss-audio');
		expect(result.network.audioSendBitrateKbps).toBe(144);
	});

	it('maps inbound audio + video and rolls up recv bitrate, jitter, rtt', () => {
		const result = mapNativeStatsToOverrides(
			stats({
				rttMs: 25,
				droppedVideoFrameCallbacks: 3,
				inbound: [
					{participantSid: 'PA_1', trackSid: 'a', kind: 'audio', bitrateKbps: 32, packetsLost: 2, jitterMs: 8},
					{participantSid: 'PA_1', trackSid: 'v', kind: 'video', bitrateKbps: 900, packetsLost: 0},
				],
			}),
		);
		expect(result.network.rttMs).toBe(25);
		expect(result.network.audioRecvBitrateKbps).toBe(32);
		expect(result.network.videoRecvBitrateKbps).toBe(900);
		expect(result.network.jitterMs).toBe(8);
		expect(result.network.droppedVideoFrameCallbacks).toBe(3);
		expect(result.remoteAudio?.trackIdentifier).toBe('a');
		expect(result.remoteVideo?.trackIdentifier).toBe('v');
		expect(result.remoteScreenShare).toBeNull();
	});

	it('maps native inbound screen-share source, dimensions, and fps into remote screen-share stats', () => {
		const result = mapNativeStatsToOverrides(
			coerceVoiceEngineV2BridgeStats({
				rttMs: 20,
				inbound: [
					{
						participantSid: 'PA_1',
						participantIdentity: 'user_2_connection_2',
						trackSid: 'TR_remote_screen',
						source: 'screen_share',
						kind: 'video',
						codec: 'video/H265',
						bitrateKbps: 4200,
						packetsLost: 0,
						width: 3840,
						height: 2160,
						sourceWidth: 3840,
						sourceHeight: 2160,
						fps: 24.7,
					},
				],
			}),
		);

		expect(result.remoteVideo).toBeNull();
		expect(result.remoteScreenShare).toMatchObject({
			trackIdentifier: 'TR_remote_screen',
			codec: 'video/H265',
			bitrateKbps: 4200,
			framesPerSecond: 24.7,
			frameWidth: 3840,
			frameHeight: 2160,
			sourceFrameWidth: 3840,
			sourceFrameHeight: 2160,
		});
	});

	it('reports worst-case packet loss across the relevant direction', () => {
		const result = mapNativeStatsToOverrides(
			stats({
				outbound: [
					{trackSid: 'a', source: 'microphone', kind: 'audio', bitrateKbps: 30, packetsLost: 5, packetsSent: 100},
				],
				inbound: [
					{participantSid: 'PA_1', trackSid: 'b', kind: 'audio', bitrateKbps: 30, packetsLost: 12, packetsReceived: 88},
				],
			}),
		);
		expect(result.network.audioPacketLossPercent).toBe(12);
	});

	it('handles empty stats without throwing and yields null tracks / zero network', () => {
		const result = mapNativeStatsToOverrides(stats({rttMs: null}));
		expect(result.localAudio).toBeNull();
		expect(result.remoteVideo).toBeNull();
		expect(result.network.rttMs).toBeNull();
		expect(result.network.videoSendBitrateKbps).toBe(0);
	});

	it('prefers the first track with non-zero bitrate when several exist', () => {
		const result = mapNativeStatsToOverrides(
			stats({
				outbound: [
					{trackSid: 'silent', source: 'microphone', kind: 'audio', bitrateKbps: 0, packetsLost: 0},
					{trackSid: 'live', source: 'microphone', kind: 'audio', bitrateKbps: 40, packetsLost: 0},
				],
			}),
		);
		expect(result.localAudio?.trackIdentifier).toBe('live');
	});
});
