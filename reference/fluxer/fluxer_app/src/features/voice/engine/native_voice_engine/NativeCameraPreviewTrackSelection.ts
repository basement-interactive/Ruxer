// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';
import type {NativeInboundVideoTrack} from '@app/features/voice/engine/native_voice_engine/NativeVideoTileManager';
import {asVoiceTrackSource, VoiceTrackSource} from '@app/features/voice/engine/VoiceTrackSource';

export interface NativeCameraPreviewParticipant {
	identity?: string;
	sid: string;
}

export interface NativeCameraPreviewTrackSelectionInput {
	currentTrackSid: string | null;
	localParticipant?: NativeCameraPreviewParticipant | null;
	sessionTrackSid: string | null;
	tracks: Readonly<Record<string, NativeInboundVideoTrack>>;
}

function assertTrackSidOrNull(trackSid: string | null, label: string): void {
	if (trackSid === null) return;
	assert.ok(trackSid.length > 0, `${label} must be null or non-empty`);
}

function isNativeCameraPreviewTrackCandidate(track: NativeInboundVideoTrack, sessionTrackSid: string | null): boolean {
	if (sessionTrackSid !== null && track.trackSid === sessionTrackSid) return false;
	return asVoiceTrackSource(track.source) === VoiceTrackSource.Camera;
}

function hasParticipantIdentity(participant: NativeCameraPreviewParticipant): participant is {
	identity: string;
	sid: string;
} {
	return participant.identity !== undefined && participant.identity.length > 0;
}

function trackMatchesPreviewParticipant(
	track: NativeInboundVideoTrack,
	participant: NativeCameraPreviewParticipant,
): boolean {
	assert.ok(
		participant.sid.length > 0 || hasParticipantIdentity(participant),
		'preview participant must be identifiable',
	);
	if (participant.sid.length > 0 && track.participantSid === participant.sid) return true;
	if (!hasParticipantIdentity(participant)) return false;
	if (track.participantIdentity === participant.identity) return true;
	return track.participantSid === participant.identity;
}

export function selectNativeCameraLocalPreviewTrack(
	input: NativeCameraPreviewTrackSelectionInput,
): NativeInboundVideoTrack | null {
	assertTrackSidOrNull(input.currentTrackSid, 'current native camera preview trackSid');
	assertTrackSidOrNull(input.sessionTrackSid, 'native camera preview session trackSid');
	if (input.currentTrackSid !== null) {
		const current = input.tracks[input.currentTrackSid];
		if (current && isNativeCameraPreviewTrackCandidate(current, input.sessionTrackSid)) return current;
	}
	const participant = input.localParticipant ?? null;
	if (!participant) return null;
	for (const track of Object.values(input.tracks)) {
		if (!isNativeCameraPreviewTrackCandidate(track, input.sessionTrackSid)) continue;
		if (trackMatchesPreviewParticipant(track, participant)) return track;
	}
	return null;
}
