// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0
import {TrackPermission} from '@livekit/protocol';

export interface ParticipantTrackPermission {
	participantIdentity?: string;

	participantSid?: string;

	allowAll?: boolean;

	allowedTrackSids?: Array<string>;
}

export function trackPermissionToProto(perms: ParticipantTrackPermission): TrackPermission {
	if (!perms.participantSid && !perms.participantIdentity) {
		throw new Error('Invalid track permission, must provide at least one of participantIdentity and participantSid');
	}
	return new TrackPermission({
		participantIdentity: perms.participantIdentity ?? '',
		participantSid: perms.participantSid ?? '',
		allTracks: perms.allowAll ?? false,
		trackSids: perms.allowedTrackSids || [],
	});
}
