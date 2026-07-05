// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0
export const monitorFrequency = 2000;

interface SenderStats {
	packetsSent?: number;

	bytesSent?: number;

	jitter?: number;

	packetsLost?: number;

	roundTripTime?: number;

	streamId?: string;

	timestamp: number;
}

export interface AudioSenderStats extends SenderStats {
	type: 'audio';
}

export interface VideoSenderStats extends SenderStats {
	type: 'video';

	firCount: number;

	pliCount: number;

	nackCount: number;

	rid: string;

	frameWidth: number;

	frameHeight: number;

	framesPerSecond: number;

	framesSent: number;

	qualityLimitationReason?: string;

	qualityLimitationDurations?: Record<string, number>;

	qualityLimitationResolutionChanges?: number;

	encoderImplementation?: string;

	powerEfficientEncoder?: boolean;

	retransmittedPacketsSent?: number;

	targetBitrate: number;
}

interface ReceiverStats {
	jitterBufferDelay?: number;

	packetsLost?: number;

	packetsReceived?: number;

	bytesReceived?: number;

	streamId?: string;

	jitter?: number;

	timestamp: number;
}

export interface AudioReceiverStats extends ReceiverStats {
	type: 'audio';

	concealedSamples?: number;

	concealmentEvents?: number;

	silentConcealedSamples?: number;

	silentConcealmentEvents?: number;

	totalAudioEnergy?: number;

	totalSamplesDuration?: number;
}

export interface VideoReceiverStats extends ReceiverStats {
	type: 'video';

	framesDecoded: number;

	framesDropped: number;

	framesReceived: number;

	frameWidth?: number;

	frameHeight?: number;

	firCount?: number;

	pliCount?: number;

	nackCount?: number;

	decoderImplementation?: string;

	powerEfficientDecoder?: boolean;

	mimeType?: string;
}

export function computeBitrate<T extends ReceiverStats | SenderStats>(currentStats: T, prevStats?: T): number {
	if (!prevStats) {
		return 0;
	}
	let bytesNow: number | undefined;
	let bytesPrev: number | undefined;
	if ('bytesReceived' in currentStats) {
		bytesNow = (currentStats as ReceiverStats).bytesReceived;
		bytesPrev = (prevStats as ReceiverStats).bytesReceived;
	} else if ('bytesSent' in currentStats) {
		bytesNow = (currentStats as SenderStats).bytesSent;
		bytesPrev = (prevStats as SenderStats).bytesSent;
	}
	if (
		bytesNow === undefined ||
		bytesPrev === undefined ||
		currentStats.timestamp === undefined ||
		prevStats.timestamp === undefined
	) {
		return 0;
	}
	return ((bytesNow - bytesPrev) * 8 * 1000) / (currentStats.timestamp - prevStats.timestamp);
}
