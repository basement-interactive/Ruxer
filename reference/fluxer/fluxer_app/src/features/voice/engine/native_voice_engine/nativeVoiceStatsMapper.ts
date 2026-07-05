// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	summarizeVoiceEngineV2Stats,
	type VoiceEngineV2PerTrackStats,
	type VoiceEngineV2Stats,
	type VoiceEngineV2StatsSummary,
	type VoiceEngineV2StatsTrackSummary,
} from '@fluxer/voice_engine_v2';

export interface NativeStatsForNerdsOverrides {
	network: {
		audioSendBitrateKbps: number;
		audioRecvBitrateKbps: number;
		videoSendBitrateKbps: number;
		videoRecvBitrateKbps: number;
		audioPacketLossPercent: number;
		videoPacketLossPercent: number;
		jitterMs: number;
		rttMs: number | null;
		droppedVideoFrameCallbacks?: number;
	};
	localVideo: VoiceEngineV2PerTrackStats | null;
	localAudio: VoiceEngineV2PerTrackStats | null;
	localScreenShare: VoiceEngineV2PerTrackStats | null;
	localScreenShareAudio: VoiceEngineV2PerTrackStats | null;
	remoteVideo: VoiceEngineV2PerTrackStats | null;
	remoteScreenShare: VoiceEngineV2PerTrackStats | null;
	remoteAudio: VoiceEngineV2PerTrackStats | null;
	remoteScreenShareAudio: VoiceEngineV2PerTrackStats | null;
	perTrackStats: Array<VoiceEngineV2PerTrackStats>;
}

function trackSummaryToPerTrack(track: VoiceEngineV2StatsTrackSummary | null): VoiceEngineV2PerTrackStats | null {
	if (!track) return null;
	return {
		direction: track.direction === 'recv' ? 'recv' : 'send',
		kind: track.kind === 'audio' || track.kind === 'video' ? track.kind : 'unknown',
		trackIdentifier: track.trackIdentifier,
		codec: track.codec,
		bitrateKbps: track.bitrateKbps,
		packetsLost: track.packetsLost,
		jitterMs: track.jitterMs,
		framesPerSecond: track.framesPerSecond,
		sourceFramesPerSecond: track.sourceFramesPerSecond,
		configuredFramesPerSecond: track.configuredFramesPerSecond,
		targetFramesPerSecond: track.targetFramesPerSecond,
		effectiveFramesPerSecond: track.effectiveFramesPerSecond,
		frameWidth: track.frameWidth,
		frameHeight: track.frameHeight,
		sourceFrameWidth: track.sourceFrameWidth,
		sourceFrameHeight: track.sourceFrameHeight,
		targetBitrateKbps: track.targetBitrateKbps,
		framesProduced: track.framesProduced,
		framesAccepted: track.framesAccepted,
		framesDropped: track.framesDropped,
		framesCoalesced: track.framesCoalesced,
		framesCaptured: track.framesCaptured,
		captureFailures: track.captureFailures,
		maxQueueAgeMs: track.maxQueueAgeMs,
		maxPushLatencyMs: track.maxPushLatencyMs,
		adaptiveSendTier: track.adaptiveSendTier,
		adaptiveSendReason: track.adaptiveSendReason,
	};
}

function summaryToOverrides(
	summary: VoiceEngineV2StatsSummary,
	stats: VoiceEngineV2Stats,
): NativeStatsForNerdsOverrides {
	const localAudio = trackSummaryToPerTrack(summary.localAudio);
	const localVideo = trackSummaryToPerTrack(summary.localVideo);
	const localScreenShare = trackSummaryToPerTrack(summary.localScreenShare);
	const localScreenShareAudio = trackSummaryToPerTrack(summary.localScreenShareAudio);
	const remoteAudio = trackSummaryToPerTrack(summary.remoteAudio);
	const remoteVideo = trackSummaryToPerTrack(summary.remoteVideo);
	const remoteScreenShare = trackSummaryToPerTrack(summary.remoteScreenShare);
	const remoteScreenShareAudio = trackSummaryToPerTrack(summary.remoteScreenShareAudio);
	return {
		network: {
			...summary.network,
			droppedVideoFrameCallbacks: stats.droppedVideoFrameCallbacks ?? stats.droppedNativeVideoFrames,
		},
		localAudio,
		localVideo,
		localScreenShare,
		localScreenShareAudio,
		remoteAudio,
		remoteVideo,
		remoteScreenShare,
		remoteScreenShareAudio,
		perTrackStats: [
			localAudio,
			localVideo,
			localScreenShare,
			localScreenShareAudio,
			remoteAudio,
			remoteVideo,
			remoteScreenShare,
			remoteScreenShareAudio,
		].filter((track): track is VoiceEngineV2PerTrackStats => track !== null),
	};
}

export function mapNativeStatsToOverrides(stats: VoiceEngineV2Stats): NativeStatsForNerdsOverrides {
	return summaryToOverrides(summarizeVoiceEngineV2Stats(stats), stats);
}

export function mapNativeStatsToPerTrackStats(stats: VoiceEngineV2Stats): Array<VoiceEngineV2PerTrackStats> {
	return mapNativeStatsToOverrides(stats).perTrackStats;
}
