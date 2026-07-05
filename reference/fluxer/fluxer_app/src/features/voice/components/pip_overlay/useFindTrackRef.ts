// SPDX-License-Identifier: AGPL-3.0-or-later

import type {PiPContent} from '@app/features/ui/state/PiP';
import {pipOverlayLogger} from '@app/features/voice/components/pip_overlay/shared';
import {parseStreamKey} from '@app/features/voice/components/StreamKeys';
import ScreenSharePublicationMigration from '@app/features/voice/engine/ScreenSharePublicationMigration';
import {useStoreVersion} from '@app/features/voice/engine/Store';
import {selectVoiceMediaGraphViewerStreamKeys} from '@app/features/voice/engine/VoiceMediaGraph';
import {voiceMediaGraphStore} from '@app/features/voice/engine/VoiceMediaGraphStore';
import {VoiceTrackSource} from '@app/features/voice/engine/VoiceTrackSource';
import {isTrackReference, type TrackReferenceOrPlaceholder, useTracks} from '@livekit/components-react';
import {type Room, RoomEvent, type Track} from 'livekit-client';
import {useEffect, useMemo} from 'react';

const CAMERA_SOURCE = VoiceTrackSource.Camera as Track.Source;
const SCREEN_SHARE_SOURCE = VoiceTrackSource.ScreenShare as Track.Source;

function summarizeTrackRef(trackRef: TrackReferenceOrPlaceholder): object {
	const summary = {
		participantIdentity: trackRef.participant.identity,
		source: trackRef.source,
		isTrackReference: isTrackReference(trackRef),
	};
	if (!isTrackReference(trackRef)) return summary;
	const publicationRecord = trackRef.publication as unknown as Record<string, unknown>;
	return {
		...summary,
		trackSid: trackRef.publication.trackSid,
		isMuted: trackRef.publication.isMuted,
		isSubscribed: typeof publicationRecord.isSubscribed === 'boolean' ? publicationRecord.isSubscribed : null,
		hasTrack: Boolean(trackRef.publication.track),
	};
}

export function useFindTrackRef(content: PiPContent | null, room: Room): TrackReferenceOrPlaceholder | null {
	useStoreVersion(ScreenSharePublicationMigration);
	const tracks = useTracks(
		[
			{source: CAMERA_SOURCE, withPlaceholder: true},
			{source: SCREEN_SHARE_SOURCE, withPlaceholder: true},
		],
		{
			updateOnlyOn: [
				RoomEvent.TrackPublished,
				RoomEvent.TrackUnpublished,
				RoomEvent.TrackSubscribed,
				RoomEvent.TrackUnsubscribed,
				RoomEvent.TrackMuted,
				RoomEvent.TrackUnmuted,
			],
			onlySubscribed: false,
			room,
		},
	);
	useStoreVersion(voiceMediaGraphStore);
	const viewerStreamKeys = selectVoiceMediaGraphViewerStreamKeys(voiceMediaGraphStore.getGraphSnapshot());
	const screenSharePublicationMigrationVersion = ScreenSharePublicationMigration.version;
	const resolvedTrackRef = useMemo(() => {
		if (!content) return null;
		const targetSource = content.type === 'stream' ? SCREEN_SHARE_SOURCE : CAMERA_SOURCE;
		const matchingTrackRefs = tracks.filter(
			(tr) => tr.participant.identity === content.participantIdentity && tr.source === targetSource,
		);
		const resolvedTrackRef =
			targetSource === SCREEN_SHARE_SOURCE
				? (matchingTrackRefs.find((tr) => {
						if (!isTrackReference(tr)) return false;
						const selected = ScreenSharePublicationMigration.selectScreenSharePublication(tr.participant);
						return selected?.trackSid === tr.publication.trackSid;
					}) ??
					matchingTrackRefs[0] ??
					null)
				: (matchingTrackRefs[0] ?? null);
		if (resolvedTrackRef) return resolvedTrackRef;
		if (content.type !== 'stream') return null;
		const hasMatchingViewerStreamKey = viewerStreamKeys.some((streamKey) => {
			const parsed = parseStreamKey(streamKey);
			if (!parsed) return false;
			return (
				parsed.channelId === content.channelId &&
				parsed.guildId === content.guildId &&
				parsed.connectionId === content.connectionId
			);
		});
		if (!hasMatchingViewerStreamKey) return null;
		const fallbackParticipant =
			room.localParticipant.identity === content.participantIdentity
				? room.localParticipant
				: (room.remoteParticipants.get(content.participantIdentity) ?? null);
		if (!fallbackParticipant) return null;
		const publication =
			ScreenSharePublicationMigration.selectScreenSharePublication(fallbackParticipant) ??
			fallbackParticipant.getTrackPublication(SCREEN_SHARE_SOURCE);
		if (!publication) {
			return {
				participant: fallbackParticipant,
				source: SCREEN_SHARE_SOURCE,
			};
		}
		return {
			participant: fallbackParticipant,
			source: SCREEN_SHARE_SOURCE,
			publication,
		};
	}, [tracks, content, room, screenSharePublicationMigrationVersion, viewerStreamKeys]);
	const trackCandidates = useMemo(() => tracks.map((trackRef) => summarizeTrackRef(trackRef)), [tracks]);
	useEffect(() => {
		if (!content) return;
		const targetSource = content.type === 'stream' ? SCREEN_SHARE_SOURCE : CAMERA_SOURCE;
		const hasMatchingViewerStreamKey = viewerStreamKeys.some((streamKey) => {
			const parsed = parseStreamKey(streamKey);
			if (!parsed) return false;
			return (
				parsed.channelId === content.channelId &&
				parsed.guildId === content.guildId &&
				parsed.connectionId === content.connectionId
			);
		});
		pipOverlayLogger.debug('PiP track lookup', {
			content,
			targetSource,
			resolvedTrackRef: resolvedTrackRef ? summarizeTrackRef(resolvedTrackRef) : null,
			candidateCount: trackCandidates.length,
			candidates: trackCandidates,
			viewerStreamKeys,
			hasMatchingViewerStreamKey,
			roomLocalParticipantIdentity: room.localParticipant.identity,
			remoteParticipantIdentities: Array.from(room.remoteParticipants.keys()),
		});
	}, [content, resolvedTrackRef, room, trackCandidates, viewerStreamKeys]);
	return resolvedTrackRef;
}
