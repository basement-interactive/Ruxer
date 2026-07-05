// SPDX-License-Identifier: AGPL-3.0-or-later

export interface ParsedVoiceParticipantIdentity {
	userId: string;
	connectionId: string;
}

export function parseVoiceParticipantIdentity(identity: string): ParsedVoiceParticipantIdentity {
	const match = identity.match(/^user_(\d+)_(.+)$/);
	return {userId: match?.[1] ?? '', connectionId: match?.[2] ?? ''};
}

export function buildVoiceParticipantIdentity(userId: string, connectionId: string): string {
	return `user_${userId}_${connectionId}`;
}
