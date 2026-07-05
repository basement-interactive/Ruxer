// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	acquireSelfWindowScreenShareAudioTrack,
	releaseSelfWindowScreenShareAudioTrack,
} from '@app/features/voice/utils/SelfWindowScreenShareAudio';

export interface MixedSelfWindowAudioTrack {
	track: MediaStreamTrack;
	cleanup: () => Promise<void>;
}

export async function mixTrackWithSelfWindowScreenShareAudio(
	primaryTrack: MediaStreamTrack,
	options: {sampleRate?: number; unavailableMessage?: string} = {},
): Promise<MixedSelfWindowAudioTrack> {
	const selfWindowTrack = acquireSelfWindowScreenShareAudioTrack();
	if (!selfWindowTrack) {
		throw new Error(options.unavailableMessage ?? 'Self-window app-audio tap unavailable');
	}
	const AudioContextCtor = window.AudioContext ?? window.webkitAudioContext;
	if (!AudioContextCtor) {
		releaseSelfWindowScreenShareAudioTrack(selfWindowTrack);
		throw new Error('AudioContext unavailable for self-window audio mix');
	}
	let audioContext: AudioContext | null = null;
	let primarySource: MediaStreamAudioSourceNode | null = null;
	let selfSource: MediaStreamAudioSourceNode | null = null;
	let mixedTrack: MediaStreamTrack | null = null;
	try {
		audioContext = new AudioContextCtor({sampleRate: options.sampleRate ?? 48000});
		const destination = audioContext.createMediaStreamDestination();
		primarySource = audioContext.createMediaStreamSource(new MediaStream([primaryTrack]));
		selfSource = audioContext.createMediaStreamSource(new MediaStream([selfWindowTrack]));
		primarySource.connect(destination);
		selfSource.connect(destination);
		mixedTrack = destination.stream.getAudioTracks()[0] ?? null;
		if (!mixedTrack) {
			throw new Error('Self-window audio mixer produced no output track');
		}
		if (audioContext.state === 'suspended') {
			void audioContext.resume().catch(() => {});
		}
	} catch (error) {
		try {
			primarySource?.disconnect();
		} catch {}
		try {
			selfSource?.disconnect();
		} catch {}
		try {
			mixedTrack?.stop();
		} catch {}
		releaseSelfWindowScreenShareAudioTrack(selfWindowTrack);
		await audioContext?.close().catch(() => {});
		throw error;
	}
	let cleanedUp = false;
	const cleanup = async (): Promise<void> => {
		if (cleanedUp) return;
		cleanedUp = true;
		try {
			primarySource?.disconnect();
		} catch {}
		try {
			selfSource?.disconnect();
		} catch {}
		try {
			mixedTrack?.stop();
		} catch {}
		releaseSelfWindowScreenShareAudioTrack(selfWindowTrack);
		await audioContext?.close().catch(() => {});
	};
	return {
		track: mixedTrack,
		cleanup,
	};
}
