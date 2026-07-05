// SPDX-License-Identifier: AGPL-3.0-or-later

const playbackBoostByIdentity = new Map<string, number>();

export function getRemoteVoicePlaybackBoost(identity: string): number {
	return playbackBoostByIdentity.get(identity) ?? 1;
}

export function setRemoteVoicePlaybackBoost(identity: string, boost: number): void {
	if (!Number.isFinite(boost) || boost <= 1) {
		playbackBoostByIdentity.delete(identity);
		return;
	}
	playbackBoostByIdentity.set(identity, boost);
}

export function clearRemoteVoicePlaybackBoost(identity: string): void {
	playbackBoostByIdentity.delete(identity);
}
