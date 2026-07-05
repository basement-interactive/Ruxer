// SPDX-License-Identifier: AGPL-3.0-or-later

import {VoiceTrackSource} from '@app/features/voice/engine/VoiceTrackSource';
import {parseVoiceParticipantIdentity} from '@app/features/voice/utils/VoiceParticipantIdentity';
import {isTrackReference, type TrackReferenceOrPlaceholder} from '@livekit/components-react';

export interface VoiceGridEntry {
	kind: 'track';
	key: string;
	trackRef: TrackReferenceOrPlaceholder;
	hiddenConnectionCount: number;
	deviceConnectionCount: number;
	isDeviceGroupExpanded: boolean;
	isDeviceGroupPrimary?: boolean;
	userId: string | null;
}

export interface ConsolidateInput {
	tracks: Array<TrackReferenceOrPlaceholder>;
	expandedUserIds: ReadonlySet<string>;
}

function getTrackKey(trackRef: TrackReferenceOrPlaceholder, fallbackIndex: number): string {
	if (trackRef.source != null) {
		return `${trackRef.participant.identity}-${trackRef.source}`;
	}
	return `placeholder-${trackRef.participant.identity}-${fallbackIndex}`;
}

function isActiveTrackRef(trackRef: TrackReferenceOrPlaceholder): boolean {
	if (trackRef.source === VoiceTrackSource.ScreenShare) return true;
	if (!isTrackReference(trackRef)) return false;
	const publication = trackRef.publication;
	if (!publication) return false;
	return !publication.isMuted;
}

interface UserGroup {
	userId: string;
	connectionIds: Set<string>;
	trackRefs: Array<{trackRef: TrackReferenceOrPlaceholder; originalIndex: number}>;
	firstIndex: number;
}

export function consolidateVoiceGridTracks({tracks, expandedUserIds}: ConsolidateInput): Array<VoiceGridEntry> {
	const groupsByUserId = new Map<string, UserGroup>();
	const orderedUserKeys: Array<string | null> = [];
	const ungroupedTracks: Array<{trackRef: TrackReferenceOrPlaceholder; originalIndex: number}> = [];
	tracks.forEach((trackRef, index) => {
		const {userId, connectionId} = parseVoiceParticipantIdentity(trackRef.participant.identity);
		if (!userId) {
			ungroupedTracks.push({trackRef, originalIndex: index});
			orderedUserKeys.push(null);
			return;
		}
		let group = groupsByUserId.get(userId);
		if (!group) {
			group = {userId, connectionIds: new Set(), trackRefs: [], firstIndex: index};
			groupsByUserId.set(userId, group);
			orderedUserKeys.push(userId);
		}
		if (connectionId) group.connectionIds.add(connectionId);
		group.trackRefs.push({trackRef, originalIndex: index});
	});
	const emitted = new Set<string>();
	let ungroupedCursor = 0;
	const entries: Array<VoiceGridEntry> = [];
	for (const key of orderedUserKeys) {
		if (key === null) {
			const item = ungroupedTracks[ungroupedCursor++];
			if (!item) continue;
			entries.push({
				kind: 'track',
				key: getTrackKey(item.trackRef, item.originalIndex),
				trackRef: item.trackRef,
				hiddenConnectionCount: 0,
				deviceConnectionCount: 1,
				isDeviceGroupExpanded: false,
				userId: null,
			});
			continue;
		}
		if (emitted.has(key)) continue;
		emitted.add(key);
		const group = groupsByUserId.get(key);
		if (!group) continue;
		const totalConnections = group.connectionIds.size;
		const isExpanded = expandedUserIds.has(group.userId);
		if (totalConnections <= 1 || isExpanded) {
			group.trackRefs.forEach((item, index) => {
				entries.push({
					kind: 'track',
					key: getTrackKey(item.trackRef, item.originalIndex),
					trackRef: item.trackRef,
					hiddenConnectionCount: 0,
					deviceConnectionCount: totalConnections,
					isDeviceGroupExpanded: isExpanded && totalConnections > 1,
					isDeviceGroupPrimary: isExpanded && totalConnections > 1 && index === 0,
					userId: group.userId,
				});
			});
			continue;
		}
		const activeItems = group.trackRefs.filter((item) => isActiveTrackRef(item.trackRef));
		const activeConnectionIds = new Set<string>();
		for (const item of activeItems) {
			const {connectionId} = parseVoiceParticipantIdentity(item.trackRef.participant.identity);
			if (connectionId) activeConnectionIds.add(connectionId);
		}
		const hiddenConnectionCount = Math.max(0, totalConnections - activeConnectionIds.size);
		if (activeItems.length === 0) {
			const representative = group.trackRefs[0];
			if (!representative) continue;
			entries.push({
				kind: 'track',
				key: getTrackKey(representative.trackRef, representative.originalIndex),
				trackRef: representative.trackRef,
				hiddenConnectionCount: Math.max(0, totalConnections - 1),
				deviceConnectionCount: totalConnections,
				isDeviceGroupExpanded: false,
				userId: group.userId,
			});
			continue;
		}
		activeItems.forEach((item, activeIndex) => {
			entries.push({
				kind: 'track',
				key: getTrackKey(item.trackRef, item.originalIndex),
				trackRef: item.trackRef,
				hiddenConnectionCount: activeIndex === 0 ? hiddenConnectionCount : 0,
				deviceConnectionCount: totalConnections,
				isDeviceGroupExpanded: false,
				userId: group.userId,
			});
		});
	}
	return entries;
}
