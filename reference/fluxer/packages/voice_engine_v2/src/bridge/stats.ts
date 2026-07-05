// SPDX-License-Identifier: AGPL-3.0-or-later

import type {
	VoiceEngineV2BridgeInboundStat,
	VoiceEngineV2BridgeOutboundStat,
	VoiceEngineV2BridgeSendStats,
	VoiceEngineV2BridgeStats,
	VoiceEngineV2BridgeTrackKind,
} from './types';

function asTrackKind(value: unknown): VoiceEngineV2BridgeTrackKind {
	return value === 'video' ? 'video' : 'audio';
}

function asNumber(value: unknown): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function asNonNegativeNumber(value: unknown): number {
	return Math.max(0, asNumber(value));
}

function asOptionalNumber(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asOptionalCount(value: unknown): number | undefined {
	const number = asOptionalNumber(value);
	return number == null ? undefined : Math.max(0, Math.trunc(number));
}

function asString(value: unknown): string | undefined {
	return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function coerceVoiceEngineV2BridgeSendStats(value: unknown): VoiceEngineV2BridgeSendStats | null | undefined {
	if (value == null || typeof value !== 'object') return value === null ? null : undefined;
	const payload = value as Record<string, unknown>;
	return {
		outgoingVideoQueueDepth: asNonNegativeNumber(payload.outgoingVideoQueueDepth),
		outgoingVideoQueueCapacity: asNonNegativeNumber(payload.outgoingVideoQueueCapacity),
		outgoingVideoMaxQueueDepth: asNonNegativeNumber(payload.outgoingVideoMaxQueueDepth),
		outgoingVideoFramesProduced: asNonNegativeNumber(payload.outgoingVideoFramesProduced),
		outgoingVideoFramesAccepted: asNonNegativeNumber(payload.outgoingVideoFramesAccepted),
		outgoingVideoFramesDropped: asNonNegativeNumber(payload.outgoingVideoFramesDropped),
		outgoingVideoFramesCoalesced: asNonNegativeNumber(payload.outgoingVideoFramesCoalesced),
		outgoingVideoFramesCaptured: asNonNegativeNumber(payload.outgoingVideoFramesCaptured),
		outgoingVideoCaptureFailures: asNonNegativeNumber(payload.outgoingVideoCaptureFailures),
		outgoingVideoEffectiveFps: asNonNegativeNumber(payload.outgoingVideoEffectiveFps),
		outgoingVideoTargetFps: asNonNegativeNumber(payload.outgoingVideoTargetFps),
		outgoingVideoPacingTargetFps: asNonNegativeNumber(payload.outgoingVideoPacingTargetFps),
		outgoingVideoMaxQueueAgeMs: asNonNegativeNumber(payload.outgoingVideoMaxQueueAgeMs),
		outgoingVideoMaxPushLatencyMs: asNonNegativeNumber(payload.outgoingVideoMaxPushLatencyMs),
		outgoingVideoPacingMode: asString(payload.outgoingVideoPacingMode) ?? 'unknown',
		outgoingVideoBusActive: payload.outgoingVideoBusActive === true,
		outgoingAudioBufferTargetMs: asNonNegativeNumber(payload.outgoingAudioBufferTargetMs),
		outgoingAudioBufferMaxMs: asNonNegativeNumber(payload.outgoingAudioBufferMaxMs),
		outgoingAudioUnderruns: asNonNegativeNumber(payload.outgoingAudioUnderruns),
		outgoingAudioRebuffers: asNonNegativeNumber(payload.outgoingAudioRebuffers),
		outgoingAudioMaxFrameGapMs: asNonNegativeNumber(payload.outgoingAudioMaxFrameGapMs),
		adaptiveSendTier: asString(payload.adaptiveSendTier) ?? 'unknown',
		adaptiveSendReason: asString(payload.adaptiveSendReason) ?? 'unknown',
	};
}

function coerceVoiceEngineV2BridgeOutboundStat(entry: unknown): Array<VoiceEngineV2BridgeOutboundStat> {
	if (entry == null || typeof entry !== 'object') return [];
	const e = entry as Record<string, unknown>;
	const zeroCopy = e.zeroCopy === true ? true : undefined;
	return [
		{
			trackSid: asString(e.trackSid) ?? '',
			source: asString(e.source) ?? '',
			kind: asTrackKind(e.kind),
			codec: asString(e.codec),
			bitrateKbps: asNumber(e.bitrateKbps),
			packetsLost: asNumber(e.packetsLost),
			fps: asOptionalNumber(e.fps),
			audioLevel: asOptionalNumber(e.audioLevel),
			width: asOptionalCount(e.width),
			height: asOptionalCount(e.height),
			sourceWidth: asOptionalCount(e.sourceWidth),
			sourceHeight: asOptionalCount(e.sourceHeight),
			targetBitrateKbps: asOptionalNumber(e.targetBitrateKbps),
			configuredFps: asOptionalNumber(e.configuredFps),
			targetFps: asOptionalNumber(e.targetFps),
			effectiveFps: asOptionalNumber(e.effectiveFps),
			framesProduced: asOptionalCount(e.framesProduced),
			framesAccepted: asOptionalCount(e.framesAccepted),
			framesDropped: asOptionalCount(e.framesDropped),
			framesCoalesced: asOptionalCount(e.framesCoalesced),
			framesCaptured: asOptionalCount(e.framesCaptured),
			captureFailures: asOptionalCount(e.captureFailures),
			maxQueueAgeMs: asOptionalNumber(e.maxQueueAgeMs),
			maxPushLatencyMs: asOptionalNumber(e.maxPushLatencyMs),
			adaptiveSendTier: asString(e.adaptiveSendTier),
			adaptiveSendReason: asString(e.adaptiveSendReason),
			...(zeroCopy === true ? {zeroCopy} : {}),
		},
	];
}

function coerceVoiceEngineV2BridgeInboundStat(entry: unknown): Array<VoiceEngineV2BridgeInboundStat> {
	if (entry == null || typeof entry !== 'object') return [];
	const e = entry as Record<string, unknown>;
	const participantIdentity = asString(e.participantIdentity);
	return [
		{
			...(participantIdentity ? {participantIdentity} : {}),
			participantSid: asString(e.participantSid) ?? '',
			trackSid: asString(e.trackSid) ?? '',
			source: asString(e.source),
			kind: asTrackKind(e.kind),
			codec: asString(e.codec),
			bitrateKbps: asNumber(e.bitrateKbps),
			packetsLost: asNumber(e.packetsLost),
			jitterMs: asOptionalNumber(e.jitterMs),
			audioLevel: asOptionalNumber(e.audioLevel),
			width: asOptionalCount(e.width),
			height: asOptionalCount(e.height),
			fps: asOptionalNumber(e.fps),
			sourceWidth: asOptionalCount(e.sourceWidth),
			sourceHeight: asOptionalCount(e.sourceHeight),
		},
	];
}

export function coerceVoiceEngineV2BridgeStats(payload: Record<string, unknown>): VoiceEngineV2BridgeStats {
	const rttRaw = payload.rttMs;
	const rttMs = typeof rttRaw === 'number' && Number.isFinite(rttRaw) ? rttRaw : null;
	const droppedNativeVideoFrames = asOptionalCount(payload.droppedNativeVideoFrames);
	const droppedVideoFrameCallbacks = asOptionalCount(payload.droppedVideoFrameCallbacks);
	const outbound = Array.isArray(payload.outbound)
		? payload.outbound.flatMap((entry) => coerceVoiceEngineV2BridgeOutboundStat(entry))
		: [];
	const inbound = Array.isArray(payload.inbound)
		? payload.inbound.flatMap((entry) => coerceVoiceEngineV2BridgeInboundStat(entry))
		: [];
	const send = coerceVoiceEngineV2BridgeSendStats(payload.send);
	return {rttMs, outbound, inbound, droppedNativeVideoFrames, droppedVideoFrameCallbacks, send};
}
