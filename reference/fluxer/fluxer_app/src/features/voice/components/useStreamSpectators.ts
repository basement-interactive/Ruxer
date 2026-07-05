// SPDX-License-Identifier: AGPL-3.0-or-later

import type {User} from '@app/features/user/models/User';
import Users from '@app/features/user/state/Users';
import {parseStreamKey} from '@app/features/voice/components/StreamKeys';
import {
	createVoiceParticipantSortSnapshot,
	sortVoiceParticipantItemsWithSnapshot,
} from '@app/features/voice/components/VoiceParticipantSortUtils';
import MediaEngine, {useMediaEngineVersion} from '@app/features/voice/engine/MediaEngineFacade';
import type {NormalizedVoiceState, VoiceGatewayVoiceStates} from '@app/features/voice/engine/VoiceGatewayStateMachine';
import {useMemo, useRef} from 'react';

export interface SpectatorEntry {
	userId: string;
	connectionId: string;
	isMobile: boolean;
	user: User;
}

interface StreamSpectatorsResult {
	viewerIds: ReadonlyArray<string>;
	viewerUsers: ReadonlyArray<User>;
	spectatorEntries: ReadonlyArray<SpectatorEntry>;
}

const EMPTY_STREAM_SPECTATORS_RESULT: StreamSpectatorsResult = {
	viewerIds: [],
	viewerUsers: [],
	spectatorEntries: [],
};

function findUserIdByConnectionId(allStates: Readonly<VoiceGatewayVoiceStates>, connectionId: string): string | null {
	for (const guildId in allStates) {
		const guildStates = allStates[guildId];
		if (!guildStates) continue;
		for (const channelId in guildStates) {
			const channelStates = guildStates[channelId];
			if (!channelStates) continue;
			const voiceState = channelStates[connectionId];
			if (voiceState?.user_id) {
				return voiceState.user_id;
			}
		}
	}
	return null;
}

function pushSpectatorEntry(
	entries: Array<SpectatorEntry>,
	voiceState: NormalizedVoiceState,
	seenConnections: Set<string>,
	streamKey: string,
	localConnectionId: string | null | undefined,
	streamerUserId: string | null | undefined,
): void {
	const viewerStreamKeys = voiceState.viewer_stream_keys;
	if (!viewerStreamKeys?.includes(streamKey)) return;
	if (localConnectionId != null && voiceState.connection_id === localConnectionId) return;
	if (streamerUserId != null && voiceState.user_id === streamerUserId) return;
	if (seenConnections.has(voiceState.connection_id)) return;
	seenConnections.add(voiceState.connection_id);
	const user = Users.getUser(voiceState.user_id);
	if (!user) return;
	entries.push({
		userId: voiceState.user_id,
		connectionId: voiceState.connection_id,
		isMobile: voiceState.is_mobile ?? false,
		user,
	});
}

export function useStreamSpectators(streamKey: string, streamerUserId?: string | null): StreamSpectatorsResult {
	useMediaEngineVersion();
	const localConnectionId = MediaEngine.connectionId;
	const spectatorSortSnapshotRef = useRef(createVoiceParticipantSortSnapshot());
	return useMemo(() => {
		if (!streamKey) return EMPTY_STREAM_SPECTATORS_RESULT;
		const allStates = MediaEngine.getAllVoiceStates();
		const parsedStreamKey = parseStreamKey(streamKey);
		const inferredStreamerUserId =
			streamerUserId ?? (parsedStreamKey ? findUserIdByConnectionId(allStates, parsedStreamKey.connectionId) : null);
		const entries: Array<SpectatorEntry> = [];
		const seenConnections = new Set<string>();
		for (const guildId in allStates) {
			const guildStates = allStates[guildId];
			if (!guildStates) continue;
			for (const channelId in guildStates) {
				const channelStates = guildStates[channelId];
				if (!channelStates) continue;
				for (const connectionId in channelStates) {
					const voiceState = channelStates[connectionId];
					if (!voiceState) continue;
					pushSpectatorEntry(
						entries,
						voiceState,
						seenConnections,
						streamKey,
						localConnectionId,
						inferredStreamerUserId,
					);
				}
			}
		}
		if (entries.length === 0) return EMPTY_STREAM_SPECTATORS_RESULT;
		const spectatorEntries = sortVoiceParticipantItemsWithSnapshot(entries, {
			snapshot: spectatorSortSnapshotRef.current,
			getParticipantKey: (entry) => `${entry.userId}:${entry.connectionId}`,
			getUserId: (entry) => entry.userId,
			getTieBreaker: (entry) => entry.connectionId,
		});
		const viewerIds: Array<string> = [];
		const viewerUsers: Array<User> = [];
		const seenViewerIds = new Set<string>();
		for (const entry of spectatorEntries) {
			viewerUsers.push(entry.user);
			if (seenViewerIds.has(entry.userId)) continue;
			seenViewerIds.add(entry.userId);
			viewerIds.push(entry.userId);
		}
		return {viewerIds, viewerUsers, spectatorEntries};
	}, [localConnectionId, streamerUserId, streamKey]);
}
