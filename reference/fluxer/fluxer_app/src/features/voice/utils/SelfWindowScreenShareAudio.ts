// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	addSoundCaptureDestination,
	getSoundCaptureAudioContext,
	removeSoundCaptureDestination,
} from '@app/features/notification/utils/SoundUtils';
import {Logger} from '@app/features/platform/utils/AppLogger';

const logger = new Logger('SelfWindowScreenShareAudio');

interface ActiveTap {
	destinationNode: MediaStreamAudioDestinationNode;
	track: MediaStreamTrack;
}

let activeTap: ActiveTap | null = null;

export function acquireSelfWindowScreenShareAudioTrack(): MediaStreamTrack | null {
	if (activeTap) {
		releaseSelfWindowScreenShareAudioTrack();
	}
	try {
		const ctx = getSoundCaptureAudioContext();
		const destinationNode = ctx.createMediaStreamDestination();
		addSoundCaptureDestination(destinationNode);
		const [track] = destinationNode.stream.getAudioTracks();
		if (!track) {
			removeSoundCaptureDestination(destinationNode);
			logger.warn('MediaStreamAudioDestinationNode produced no audio track');
			return null;
		}
		activeTap = {destinationNode, track};
		track.addEventListener(
			'ended',
			() => {
				if (activeTap?.track === track) {
					releaseSelfWindowScreenShareAudioTrack();
				}
			},
			{once: true},
		);
		return track;
	} catch (error) {
		logger.warn('Failed to create self-window screen-share audio tap', {error});
		return null;
	}
}

export function releaseSelfWindowScreenShareAudioTrack(expectedTrack?: MediaStreamTrack): void {
	const tap = activeTap;
	if (!tap) return;
	if (expectedTrack && tap.track !== expectedTrack) return;
	activeTap = null;
	removeSoundCaptureDestination(tap.destinationNode);
	try {
		tap.track.stop();
	} catch {}
}
