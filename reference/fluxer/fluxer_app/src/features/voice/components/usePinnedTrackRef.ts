// SPDX-License-Identifier: AGPL-3.0-or-later

import * as VoiceCallLayoutCommands from '@app/features/voice/commands/VoiceCallLayoutCommands';
import {asPinnableVoiceTrackSource} from '@app/features/voice/engine/VoiceTrackSource';
import {
	isVoiceEngineV2AppParticipantSpeaking,
	type VoiceEngineV2AppParticipantSnapshot,
} from '@app/features/voice/engine/v2/VoiceEngineV2AppSelectors';
import type {PinnedParticipantSource} from '@app/features/voice/state/VoiceCallLayout';
import {isTrackReference, type TrackReferenceOrPlaceholder} from '@livekit/components-react';
import {useEffect, useMemo} from 'react';

type LayoutMode = 'grid' | 'focus';

interface UsePinnedTrackRefArgs {
	layoutMode: LayoutMode;
	pinnedParticipantIdentity: string | null;
	pinnedParticipantSource: PinnedParticipantSource;
	filteredCameraTracks: Array<TrackReferenceOrPlaceholder>;
	cameraTracksAll: Array<TrackReferenceOrPlaceholder>;
	screenShareTracks: Array<TrackReferenceOrPlaceholder>;
	compareTracks: (left: TrackReferenceOrPlaceholder, right: TrackReferenceOrPlaceholder) => number;
	participantSnapshots: Readonly<Record<string, VoiceEngineV2AppParticipantSnapshot>>;
}

function identityOf(track: TrackReferenceOrPlaceholder): string {
	return track.participant?.identity ?? '';
}

function sortByParticipant(
	tracks: Array<TrackReferenceOrPlaceholder>,
	compareTracks: UsePinnedTrackRefArgs['compareTracks'],
) {
	return [...tracks].sort(compareTracks);
}

function sortByMostRecentSpeaking(
	tracks: Array<TrackReferenceOrPlaceholder>,
	compareTracks: UsePinnedTrackRefArgs['compareTracks'],
	participantSnapshots: UsePinnedTrackRefArgs['participantSnapshots'],
): Array<TrackReferenceOrPlaceholder> {
	return [...tracks].sort((a, b) => {
		const aSpeaking = isVoiceEngineV2AppParticipantSpeaking(participantSnapshots[a.participant?.identity ?? ''])
			? 1
			: 0;
		const bSpeaking = isVoiceEngineV2AppParticipantSpeaking(participantSnapshots[b.participant?.identity ?? ''])
			? 1
			: 0;
		if (aSpeaking !== bSpeaking) {
			return bSpeaking - aSpeaking;
		}
		const aLastSpokeAt = participantSnapshots[a.participant?.identity ?? '']?.lastSpokeAt ?? 0;
		const bLastSpokeAt = participantSnapshots[b.participant?.identity ?? '']?.lastSpokeAt ?? 0;
		if (aLastSpokeAt !== bLastSpokeAt) {
			return bLastSpokeAt - aLastSpokeAt;
		}
		return compareTracks(a, b);
	});
}

function findByIdentity(
	tracks: Array<TrackReferenceOrPlaceholder>,
	identity: string | null,
): TrackReferenceOrPlaceholder | null {
	if (!identity) return null;
	return tracks.find((t) => identityOf(t) === identity) ?? null;
}

function findByIdentityAndSource(
	tracks: Array<TrackReferenceOrPlaceholder>,
	identity: string | null,
	source: PinnedParticipantSource,
): TrackReferenceOrPlaceholder | null {
	if (!identity || !source) return null;
	return tracks.find((track) => identityOf(track) === identity && track.source === source) ?? null;
}

function dedupeTracksByIdentityAndSource(
	tracks: Array<TrackReferenceOrPlaceholder>,
): Array<TrackReferenceOrPlaceholder> {
	const seen = new Set<string>();
	const deduped: Array<TrackReferenceOrPlaceholder> = [];
	for (const track of tracks) {
		const key = `${identityOf(track)}::${track.source}`;
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		deduped.push(track);
	}
	return deduped;
}

export function usePinnedTrackRef({
	layoutMode,
	pinnedParticipantIdentity,
	pinnedParticipantSource,
	filteredCameraTracks,
	cameraTracksAll,
	screenShareTracks,
	compareTracks,
	participantSnapshots,
}: UsePinnedTrackRefArgs) {
	const cameraBase = filteredCameraTracks.length > 0 ? filteredCameraTracks : cameraTracksAll;
	const camerasSorted = useMemo(() => sortByParticipant(cameraBase, compareTracks), [cameraBase, compareTracks]);
	const camerasAllSorted = useMemo(
		() => sortByParticipant(cameraTracksAll, compareTracks),
		[cameraTracksAll, compareTracks],
	);
	const camerasByMostRecentSpeaking = useMemo(
		() => sortByMostRecentSpeaking(cameraBase, compareTracks, participantSnapshots),
		[cameraBase, compareTracks, participantSnapshots],
	);
	const screensSorted = useMemo(
		() => sortByParticipant(screenShareTracks, compareTracks),
		[screenShareTracks, compareTracks],
	);
	const defaultFocusTrack = useMemo<TrackReferenceOrPlaceholder | null>(() => {
		return screensSorted[0] ?? camerasByMostRecentSpeaking[0] ?? camerasSorted[0] ?? null;
	}, [screensSorted, camerasByMostRecentSpeaking, camerasSorted]);
	const pinnedTrack = useMemo(() => {
		const allTracks = [...screensSorted, ...camerasAllSorted];
		const fromSource = findByIdentityAndSource(allTracks, pinnedParticipantIdentity, pinnedParticipantSource);
		if (fromSource) return fromSource;
		const fromScreens = findByIdentity(screensSorted, pinnedParticipantIdentity);
		if (fromScreens) return fromScreens;
		return findByIdentity(camerasAllSorted, pinnedParticipantIdentity);
	}, [screensSorted, camerasAllSorted, pinnedParticipantIdentity, pinnedParticipantSource]);
	const mainTrack = useMemo<TrackReferenceOrPlaceholder | null>(() => {
		if (layoutMode !== 'focus') return null;
		return pinnedTrack ?? defaultFocusTrack;
	}, [layoutMode, pinnedTrack, defaultFocusTrack]);
	const carouselTracks = useMemo<Array<TrackReferenceOrPlaceholder>>(
		() => dedupeTracksByIdentityAndSource([...screensSorted, ...camerasSorted]),
		[screensSorted, camerasSorted],
	);
	const pipTrack = useMemo<TrackReferenceOrPlaceholder | null>(
		() => pinnedTrack ?? defaultFocusTrack,
		[pinnedTrack, defaultFocusTrack],
	);
	useEffect(() => {
		if (layoutMode !== 'focus') return;
		if (pinnedParticipantIdentity) return;
		if (defaultFocusTrack && isTrackReference(defaultFocusTrack)) {
			const identity = identityOf(defaultFocusTrack);
			const source = asPinnableVoiceTrackSource(defaultFocusTrack.source);
			if (identity) VoiceCallLayoutCommands.setPinnedParticipant(identity, source);
		}
	}, [layoutMode, pinnedParticipantIdentity, defaultFocusTrack]);
	return {mainTrack, carouselTracks, pipTrack};
}
