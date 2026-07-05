// SPDX-License-Identifier: AGPL-3.0-or-later

import Users from '@app/features/user/state/Users';
import {parseVoiceParticipantIdentity} from '@app/features/voice/utils/VoiceParticipantIdentity';
import {isTrackReference, type TrackReferenceOrPlaceholder} from '@livekit/components-react';
import type {Participant} from 'livekit-client';

export function isKnownVoiceParticipantIdentity(identity: string): boolean {
	const {userId, connectionId} = parseVoiceParticipantIdentity(identity);
	if (!userId || !connectionId) return false;
	return Boolean(Users.getUser(userId));
}

export function isKnownVoiceTrackRef(trackRef: TrackReferenceOrPlaceholder): boolean {
	return isKnownVoiceParticipantIdentity(trackRef.participant.identity);
}

export function countKnownVoiceParticipants(participants: ReadonlyArray<Participant>): number {
	const identities = new Set<string>();
	for (const participant of participants) {
		if (!isKnownVoiceParticipantIdentity(participant.identity)) continue;
		identities.add(participant.identity);
	}
	return identities.size;
}

function getTrackReferencePreference(trackRef: TrackReferenceOrPlaceholder): number {
	if (!isTrackReference(trackRef)) return 0;
	const publication = trackRef.publication;
	let preference = 1;
	if (!publication.isMuted) preference += 2;
	if (publication.isSubscribed) preference += 4;
	const mediaStreamTrack = publication.videoTrack?.mediaStreamTrack ?? publication.audioTrack?.mediaStreamTrack;
	if (mediaStreamTrack && mediaStreamTrack.readyState !== 'ended') preference += 8;
	return preference;
}

export function dedupeTrackRefsByParticipantAndSource(
	tracks: ReadonlyArray<TrackReferenceOrPlaceholder>,
): Array<TrackReferenceOrPlaceholder> {
	const deduped: Array<TrackReferenceOrPlaceholder> = [];
	const indexByKey = new Map<string, number>();
	for (const trackRef of tracks) {
		const key = `${trackRef.participant.identity}:${trackRef.source}`;
		const existingIndex = indexByKey.get(key);
		if (existingIndex === undefined) {
			indexByKey.set(key, deduped.length);
			deduped.push(trackRef);
			continue;
		}
		const existing = deduped[existingIndex];
		if (getTrackReferencePreference(trackRef) >= getTrackReferencePreference(existing)) {
			deduped[existingIndex] = trackRef;
		}
	}
	return deduped;
}
