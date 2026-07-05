// SPDX-License-Identifier: AGPL-3.0-or-later

import {consolidateVoiceGridTracks} from '@app/features/voice/components/VoiceParticipantConsolidation';
import {
	VoiceTrackSource,
	type VoiceTrackSource as VoiceTrackSourceType,
} from '@app/features/voice/engine/VoiceTrackSource';
import type {TrackReferenceOrPlaceholder} from '@livekit/components-react';
import {describe, expect, it} from 'vitest';

interface MakeTrackArgs {
	userId: string;
	connectionId: string;
	source?: VoiceTrackSourceType;
	muted?: boolean;
	placeholder?: boolean;
}

function makeTrack({
	userId,
	connectionId,
	source = VoiceTrackSource.Camera,
	muted = false,
	placeholder = false,
}: MakeTrackArgs): TrackReferenceOrPlaceholder {
	const identity = `user_${userId}_${connectionId}`;
	const participant = {identity} as TrackReferenceOrPlaceholder['participant'];
	if (placeholder) {
		return {participant, source} as TrackReferenceOrPlaceholder;
	}
	return {
		participant,
		source,
		publication: {isMuted: muted, source} as TrackReferenceOrPlaceholder extends {publication: infer P} ? P : never,
	} as TrackReferenceOrPlaceholder;
}

const EMPTY: ReadonlySet<string> = new Set<string>();

describe('consolidateVoiceGridTracks', () => {
	it('renders a single connection as a plain track entry with no hidden devices', () => {
		const tracks = [makeTrack({userId: '1', connectionId: 'a', muted: true})];
		const entries = consolidateVoiceGridTracks({tracks, expandedUserIds: EMPTY});
		expect(entries).toHaveLength(1);
		expect(entries[0]).toMatchObject({
			kind: 'track',
			hiddenConnectionCount: 0,
			deviceConnectionCount: 1,
			isDeviceGroupExpanded: false,
			userId: '1',
		});
	});
	it('shows the highest-priority passive track when none are active and hides the rest as a count', () => {
		const tracks = [
			makeTrack({userId: '1', connectionId: 'a', muted: true}),
			makeTrack({userId: '1', connectionId: 'b', muted: true}),
			makeTrack({userId: '1', connectionId: 'c', placeholder: true}),
		];
		const entries = consolidateVoiceGridTracks({tracks, expandedUserIds: EMPTY});
		expect(entries).toHaveLength(1);
		expect(entries[0]).toMatchObject({
			kind: 'track',
			userId: '1',
			hiddenConnectionCount: 2,
			deviceConnectionCount: 3,
			isDeviceGroupExpanded: false,
		});
		expect(entries[0].trackRef.participant.identity).toBe('user_1_a');
	});
	it('keeps the lone active track and hides the rest as a badge count', () => {
		const tracks = [
			makeTrack({userId: '1', connectionId: 'a', muted: true}),
			makeTrack({userId: '1', connectionId: 'b'}),
			makeTrack({userId: '1', connectionId: 'c', muted: true}),
			makeTrack({userId: '1', connectionId: 'd', placeholder: true}),
		];
		const entries = consolidateVoiceGridTracks({tracks, expandedUserIds: EMPTY});
		expect(entries).toHaveLength(1);
		expect(entries[0]).toMatchObject({kind: 'track', hiddenConnectionCount: 3, userId: '1'});
		expect(entries[0].kind === 'track' && entries[0].trackRef.participant.identity).toBe('user_1_b');
	});
	it('attaches the hidden badge only to the first active tile when several are active', () => {
		const tracks = [
			makeTrack({userId: '1', connectionId: 'a'}),
			makeTrack({userId: '1', connectionId: 'b', source: VoiceTrackSource.ScreenShare}),
			makeTrack({userId: '1', connectionId: 'c', muted: true}),
			makeTrack({userId: '1', connectionId: 'd', muted: true}),
		];
		const entries = consolidateVoiceGridTracks({tracks, expandedUserIds: EMPTY});
		expect(entries).toHaveLength(2);
		expect(entries[0]).toMatchObject({kind: 'track', hiddenConnectionCount: 2});
		expect(entries[1]).toMatchObject({kind: 'track', hiddenConnectionCount: 0});
	});
	it('expands all connections for the user when they are in the expanded set', () => {
		const tracks = [
			makeTrack({userId: '1', connectionId: 'a', muted: true}),
			makeTrack({userId: '1', connectionId: 'b', muted: true}),
			makeTrack({userId: '1', connectionId: 'c', muted: true}),
		];
		const entries = consolidateVoiceGridTracks({tracks, expandedUserIds: new Set(['1'])});
		expect(entries).toHaveLength(3);
		for (const entry of entries) {
			expect(entry.kind).toBe('track');
			expect(entry.hiddenConnectionCount).toBe(0);
			expect(entry.deviceConnectionCount).toBe(3);
			expect(entry.isDeviceGroupExpanded).toBe(true);
		}
		expect(entries.map((entry) => entry.isDeviceGroupPrimary ?? false)).toEqual([true, false, false]);
	});
	it('preserves the order of distinct users by first appearance', () => {
		const tracks = [
			makeTrack({userId: '1', connectionId: 'a', muted: true}),
			makeTrack({userId: '2', connectionId: 'a'}),
			makeTrack({userId: '1', connectionId: 'b', muted: true}),
			makeTrack({userId: '3', connectionId: 'a', muted: true}),
			makeTrack({userId: '2', connectionId: 'b', muted: true}),
		];
		const entries = consolidateVoiceGridTracks({tracks, expandedUserIds: EMPTY});
		expect(entries.map((entry) => entry.userId)).toEqual(['1', '2', '3']);
		expect(entries[0]).toMatchObject({kind: 'track', userId: '1', hiddenConnectionCount: 1});
		expect(entries[1]).toMatchObject({kind: 'track', userId: '2', hiddenConnectionCount: 1});
		expect(entries[2]).toMatchObject({kind: 'track', userId: '3', hiddenConnectionCount: 0});
	});
});
