// SPDX-License-Identifier: AGPL-3.0-or-later

import {dedupeTrackRefsByParticipantAndSource} from '@app/features/voice/components/VoiceParticipantRenderUtils';
import ScreenSharePublicationMigration, {
	isScreenShareMigrationCandidatePublication,
} from '@app/features/voice/engine/ScreenSharePublicationMigration';
import {asVoiceTrackSource, VoiceTrackSource} from '@app/features/voice/engine/VoiceTrackSource';
import {isTrackReference, type TrackReferenceOrPlaceholder} from '@livekit/components-react';

interface VoiceCallRenderableTrackGroups {
	screenShareTracks: Array<TrackReferenceOrPlaceholder>;
	cameraTracksAll: Array<TrackReferenceOrPlaceholder>;
}

function getScreenShareDedupeKey(trackRef: TrackReferenceOrPlaceholder): string {
	return `${trackRef.participant.identity}:${trackRef.source}`;
}

function getScreenShareTrackRank(trackRef: TrackReferenceOrPlaceholder): number {
	if (!isTrackReference(trackRef)) return 0;
	const publication = trackRef.publication;
	if (!publication) return 1;
	const selected = ScreenSharePublicationMigration.selectScreenSharePublication(trackRef.participant);
	if (selected?.trackSid === publication.trackSid) return 100;
	if (isScreenShareMigrationCandidatePublication(publication)) return -1;
	const hasTrack = publication.track ? 2 : 0;
	const isLive = publication.isMuted ? 0 : 4;
	return hasTrack + isLive;
}

export function dedupeScreenShareTracks(
	tracks: ReadonlyArray<TrackReferenceOrPlaceholder>,
): Array<TrackReferenceOrPlaceholder> {
	const selected = new Map<string, TrackReferenceOrPlaceholder>();
	for (const trackRef of tracks) {
		const key = getScreenShareDedupeKey(trackRef);
		const existing = selected.get(key);
		if (!existing || getScreenShareTrackRank(trackRef) >= getScreenShareTrackRank(existing)) {
			selected.set(key, trackRef);
		}
	}
	return Array.from(selected.values());
}

export function splitVoiceCallRenderableTracks(
	renderableTracks: ReadonlyArray<TrackReferenceOrPlaceholder>,
): VoiceCallRenderableTrackGroups {
	const screens: Array<TrackReferenceOrPlaceholder> = [];
	const camerasPlusPlaceholders: Array<TrackReferenceOrPlaceholder> = [];
	for (const trackRef of renderableTracks) {
		if (
			isTrackReference(trackRef) &&
			asVoiceTrackSource(trackRef.publication.source) === VoiceTrackSource.ScreenShare
		) {
			screens.push(trackRef);
		} else if (asVoiceTrackSource(trackRef.source) !== VoiceTrackSource.ScreenShare) {
			camerasPlusPlaceholders.push(trackRef);
		}
	}
	return {
		screenShareTracks: dedupeScreenShareTracks(screens),
		cameraTracksAll: dedupeTrackRefsByParticipantAndSource(camerasPlusPlaceholders),
	};
}
