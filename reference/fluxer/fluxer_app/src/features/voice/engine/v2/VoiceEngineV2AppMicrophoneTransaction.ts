// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';
import type {VoiceEngineV2MicrophoneOptions} from '@fluxer/voice_engine_v2';
import type {AudioCaptureOptions, LocalAudioTrack, LocalTrackPublication, Room} from 'livekit-client';

export interface MicrophoneEnableContext {
	readonly room: Room;
	readonly channelId: string | null;
	readonly options: VoiceEngineV2MicrophoneOptions;
}

export interface MicrophoneEnableState {
	microphoneWasPublished: boolean;
	audioTrack: LocalAudioTrack | null;
	primaryMicPublication: LocalTrackPublication | null;
	shouldUnmuteAfter: boolean;
}

export interface MicrophoneRefreshContext {
	readonly room: Room;
	readonly options: {forceRepublish?: boolean};
	readonly audioTrack: LocalAudioTrack;
	readonly captureOptions: AudioCaptureOptions;
}

export interface MicrophoneRefreshState {
	primaryMicPublication: LocalTrackPublication | null;
	shouldUnmuteAfter: boolean;
	restartSucceeded: boolean;
}

export interface SpeakingDetectorGraph {
	readonly audioContext: AudioContext;
	readonly sourceNode: MediaStreamAudioSourceNode;
	readonly analyserNode: AnalyserNode;
	readonly samples: Uint8Array<ArrayBuffer>;
}

export interface SpeakingDetectorTickOptions {
	readonly room: Room;
	readonly track: MediaStreamTrack;
	readonly graph: SpeakingDetectorGraph;
	readonly getThresholdRms: () => number;
	readonly releaseDelayMs: number;
	readonly localParticipantIdentity: string;
}

export type MicrophoneRefreshStrategy = 'force-republish' | 'restart-in-place';

export function createInitialMicrophoneEnableState(): MicrophoneEnableState {
	return {
		microphoneWasPublished: false,
		audioTrack: null,
		primaryMicPublication: null,
		shouldUnmuteAfter: false,
	};
}

export function createInitialMicrophoneRefreshState(): MicrophoneRefreshState {
	return {
		primaryMicPublication: null,
		shouldUnmuteAfter: false,
		restartSucceeded: false,
	};
}

export function chooseMicrophoneRefreshStrategy(options: {forceRepublish?: boolean}): MicrophoneRefreshStrategy {
	assert.ok(
		options !== null && typeof options === 'object',
		'chooseMicrophoneRefreshStrategy.options must be an object',
	);
	if (options.forceRepublish === true) return 'force-republish';
	return 'restart-in-place';
}

export function computeSpeakingDetectorRms(samples: Uint8Array): number {
	assert.ok(samples !== null && samples !== undefined, 'computeSpeakingDetectorRms.samples must not be null');
	assert.ok(samples.length > 0, 'computeSpeakingDetectorRms.samples must be non-empty');
	let sumSquares = 0;
	for (let i = 0; i < samples.length; i++) {
		const normalized = (samples[i]! - 128) / 128;
		sumSquares += normalized * normalized;
	}
	return Math.sqrt(sumSquares / samples.length);
}

export function readSpeakingDetectorThresholdRms(getThresholdRms: () => number): number {
	assert.equal(
		typeof getThresholdRms,
		'function',
		'readSpeakingDetectorThresholdRms.getThresholdRms must be a function',
	);
	const threshold = getThresholdRms();
	assert.equal(typeof threshold, 'number', 'readSpeakingDetectorThresholdRms.threshold must be a number');
	assert.ok(Number.isFinite(threshold), 'readSpeakingDetectorThresholdRms.threshold must be finite');
	assert.ok(threshold >= 0, 'readSpeakingDetectorThresholdRms.threshold must be non-negative');
	return threshold;
}

export function shouldReleaseSpeakingHold(args: {
	silenceStartedAt: number | null;
	now: number;
	releaseDelayMs: number;
	currentlySpeaking: boolean;
}): boolean {
	assert.ok(args !== null && typeof args === 'object', 'shouldReleaseSpeakingHold.args must be an object');
	assert.equal(typeof args.now, 'number', 'shouldReleaseSpeakingHold.args.now must be a number');
	assert.ok(args.releaseDelayMs >= 0, 'shouldReleaseSpeakingHold.args.releaseDelayMs must be non-negative');
	if (!args.currentlySpeaking) return false;
	if (args.silenceStartedAt === null) return false;
	return args.now - args.silenceStartedAt >= args.releaseDelayMs;
}
