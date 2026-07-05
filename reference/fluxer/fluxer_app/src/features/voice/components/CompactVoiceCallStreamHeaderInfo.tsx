// SPDX-License-Identifier: AGPL-3.0-or-later

import type {Channel} from '@app/features/channel/models/Channel';
import * as NicknameUtils from '@app/features/user/utils/NicknameUtils';
import {StreamFocusHeaderInfo} from '@app/features/voice/components/StreamFocusHeaderInfo';
import {getStreamKey} from '@app/features/voice/components/StreamKeys';
import {useStreamSpectators} from '@app/features/voice/components/useStreamSpectators';
import {type StreamTrackInfo, useStreamTrackInfo} from '@app/features/voice/components/useStreamTrackInfo';
import {
	useVoiceParticipantAvatarEntries,
	type VoiceParticipantAvatarEntry,
} from '@app/features/voice/components/VoiceParticipantAvatarList';
import MediaEngine, {useMediaEngineVersion} from '@app/features/voice/engine/MediaEngineFacade';
import ScreenSharePublicationMigration from '@app/features/voice/engine/ScreenSharePublicationMigration';
import {useStoreVersion} from '@app/features/voice/engine/Store';
import {asVoiceTrackSource, VoiceTrackSource} from '@app/features/voice/engine/VoiceTrackSource';
import VoiceCallLayout, {type PinnedParticipantSource} from '@app/features/voice/state/VoiceCallLayout';
import {parseVoiceParticipantIdentity} from '@app/features/voice/utils/VoiceParticipantIdentity';
import {isTrackReference, type TrackReferenceOrPlaceholder, useTracks} from '@livekit/components-react';
import {type Room, RoomEvent, type Track} from 'livekit-client';
import {observer} from 'mobx-react-lite';
import {useMemo} from 'react';

interface CompactVoiceCallStreamHeaderInfoProps {
	channel: Channel;
	enabled: boolean;
	onOpenChange?: (open: boolean) => void;
	'data-flx'?: string;
}

const SCREEN_SHARE_SOURCE = VoiceTrackSource.ScreenShare as Track.Source;

function getFocusedScreenShareEntry(
	screenShareEntries: ReadonlyArray<VoiceParticipantAvatarEntry>,
	pinnedParticipantIdentity: string | null,
	pinnedParticipantSource: PinnedParticipantSource,
): VoiceParticipantAvatarEntry | null {
	if (screenShareEntries.length === 0) return null;
	if (pinnedParticipantIdentity && pinnedParticipantSource === VoiceTrackSource.ScreenShare) {
		const parsedIdentity = parseVoiceParticipantIdentity(pinnedParticipantIdentity);
		if (parsedIdentity.userId && parsedIdentity.connectionId) {
			const pinnedEntry = screenShareEntries.find(
				(entry) => entry.userId === parsedIdentity.userId && entry.connectionId === parsedIdentity.connectionId,
			);
			if (pinnedEntry) return pinnedEntry;
		}
	}
	return screenShareEntries[0] ?? null;
}

function useScreenShareTrackForConnection(connectionId: string, room: Room): TrackReferenceOrPlaceholder | null {
	useStoreVersion(ScreenSharePublicationMigration);
	const screenShareTracks = useTracks([{source: SCREEN_SHARE_SOURCE, withPlaceholder: false}], {
		updateOnlyOn: [
			RoomEvent.ParticipantConnected,
			RoomEvent.ParticipantDisconnected,
			RoomEvent.TrackPublished,
			RoomEvent.TrackUnpublished,
			RoomEvent.TrackMuted,
			RoomEvent.TrackUnmuted,
			RoomEvent.TrackSubscribed,
			RoomEvent.TrackUnsubscribed,
		],
		onlySubscribed: false,
		room,
	});
	const screenSharePublicationMigrationVersion = ScreenSharePublicationMigration.version;
	return useMemo(() => {
		let fallback: TrackReferenceOrPlaceholder | null = null;
		for (const trackRef of screenShareTracks) {
			if (!isTrackReference(trackRef)) continue;
			if (asVoiceTrackSource(trackRef.source) !== VoiceTrackSource.ScreenShare) continue;
			const parsedIdentity = parseVoiceParticipantIdentity(trackRef.participant.identity);
			if (parsedIdentity.connectionId !== connectionId) continue;
			const selected = ScreenSharePublicationMigration.selectScreenSharePublication(trackRef.participant);
			if (selected?.trackSid === trackRef.publication.trackSid) return trackRef;
			fallback ??= trackRef;
		}
		return fallback;
	}, [connectionId, screenShareTracks, screenSharePublicationMigrationVersion]);
}

interface CompactVoiceCallStreamHeaderInfoBaseProps {
	channel: Channel;
	focusedScreenShareEntry: VoiceParticipantAvatarEntry;
	focusedStreamTrackInfo: StreamTrackInfo | null;
	onOpenChange?: (open: boolean) => void;
	'data-flx'?: string;
}

const CompactVoiceCallStreamHeaderInfoBase = observer(function CompactVoiceCallStreamHeaderInfoBase({
	channel,
	focusedScreenShareEntry,
	focusedStreamTrackInfo,
	onOpenChange,
}: CompactVoiceCallStreamHeaderInfoBaseProps) {
	const focusedStreamKey = useMemo(
		() => getStreamKey(channel.guildId, channel.id, focusedScreenShareEntry.connectionId),
		[channel.guildId, channel.id, focusedScreenShareEntry.connectionId],
	);
	const {viewerUsers, spectatorEntries} = useStreamSpectators(focusedStreamKey, focusedScreenShareEntry.userId);
	const focusedStreamerDisplayName = useMemo(
		() => NicknameUtils.getNickname(focusedScreenShareEntry.user, channel.guildId, channel.id),
		[channel.guildId, channel.id, focusedScreenShareEntry],
	);
	return (
		<StreamFocusHeaderInfo
			streamerUser={focusedScreenShareEntry.user}
			streamerDisplayName={focusedStreamerDisplayName}
			viewerUsers={viewerUsers}
			spectatorEntries={spectatorEntries}
			trackInfo={focusedStreamTrackInfo}
			guildId={channel.guildId ?? undefined}
			channelId={channel.id}
			onOpenChange={onOpenChange}
			data-flx="voice.compact-voice-call-stream-header-info.stream-focus-header-info"
		/>
	);
});

interface CompactVoiceCallStreamHeaderInfoContentProps {
	channel: Channel;
	focusedScreenShareEntry: VoiceParticipantAvatarEntry;
	room: Room;
	onOpenChange?: (open: boolean) => void;
	'data-flx'?: string;
}

const CompactVoiceCallStreamHeaderInfoContent = observer(function CompactVoiceCallStreamHeaderInfoContent({
	channel,
	focusedScreenShareEntry,
	room,
	onOpenChange,
}: CompactVoiceCallStreamHeaderInfoContentProps) {
	useMediaEngineVersion();
	const focusedStreamTrack = useScreenShareTrackForConnection(focusedScreenShareEntry.connectionId, room);
	const focusedStreamTrackInfo = useStreamTrackInfo(focusedStreamTrack);
	return (
		<CompactVoiceCallStreamHeaderInfoBase
			channel={channel}
			focusedScreenShareEntry={focusedScreenShareEntry}
			focusedStreamTrackInfo={focusedStreamTrackInfo}
			onOpenChange={onOpenChange}
			data-flx="voice.compact-voice-call-stream-header-info.compact-voice-call-stream-header-info-base"
		/>
	);
});

export const CompactVoiceCallStreamHeaderInfo = observer(function CompactVoiceCallStreamHeaderInfo({
	channel,
	enabled,
	onOpenChange,
}: CompactVoiceCallStreamHeaderInfoProps) {
	useMediaEngineVersion();
	const participantAvatarEntries = useVoiceParticipantAvatarEntries({
		guildId: channel.guildId ?? null,
		channelId: channel.id,
	});
	const screenShareEntries = useMemo(
		() => participantAvatarEntries.filter((entry) => entry.hasScreenShare),
		[participantAvatarEntries],
	);
	const {layoutMode, pinnedParticipantIdentity, pinnedParticipantSource} = VoiceCallLayout;
	const focusedScreenShareEntry = useMemo(
		() => getFocusedScreenShareEntry(screenShareEntries, pinnedParticipantIdentity, pinnedParticipantSource),
		[pinnedParticipantIdentity, pinnedParticipantSource, screenShareEntries],
	);
	const shouldShow =
		enabled &&
		layoutMode === 'focus' &&
		(pinnedParticipantIdentity == null || pinnedParticipantSource === VoiceTrackSource.ScreenShare) &&
		focusedScreenShareEntry != null;
	const room = MediaEngine.room;
	if (!shouldShow || !focusedScreenShareEntry) return null;
	if (!room) {
		if (!MediaEngine.connected) return null;
		return (
			<CompactVoiceCallStreamHeaderInfoBase
				channel={channel}
				focusedScreenShareEntry={focusedScreenShareEntry}
				focusedStreamTrackInfo={null}
				onOpenChange={onOpenChange}
				data-flx="voice.compact-voice-call-stream-header-info.compact-voice-call-stream-header-info-base"
			/>
		);
	}
	return (
		<CompactVoiceCallStreamHeaderInfoContent
			channel={channel}
			focusedScreenShareEntry={focusedScreenShareEntry}
			room={room}
			onOpenChange={onOpenChange}
			data-flx="voice.compact-voice-call-stream-header-info.compact-voice-call-stream-header-info-content"
		/>
	);
});
