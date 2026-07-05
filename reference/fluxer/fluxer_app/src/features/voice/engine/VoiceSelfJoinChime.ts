// SPDX-License-Identifier: AGPL-3.0-or-later

import {SoundType} from '@app/features/notification/utils/SoundUtils';
import * as SoundCommands from '@app/features/ui/commands/SoundCommands';
import VoiceRegionTeleport from '@app/features/voice/state/VoiceRegionTeleport';

export const SELF_JOIN_CHIME_DEDUPE_WINDOW_MS = 2000;
const RECENT_SELF_JOIN_CHIME_MAX_ENTRIES = 16;

export type SelfJoinChimeSource = 'gateway' | 'livekit-room' | 'native-ready';

interface RecentSelfJoinChime {
	playedAt: number;
	source: SelfJoinChimeSource;
}

const recentSelfJoinChimesByConnectionId = new Map<string, RecentSelfJoinChime>();

export function resetSelfJoinChimesForTests(): void {
	recentSelfJoinChimesByConnectionId.clear();
}

function pruneRecentSelfJoinChimes(now: number): void {
	for (const [connectionId, entry] of recentSelfJoinChimesByConnectionId) {
		if (now - entry.playedAt >= SELF_JOIN_CHIME_DEDUPE_WINDOW_MS) {
			recentSelfJoinChimesByConnectionId.delete(connectionId);
		}
	}
	while (recentSelfJoinChimesByConnectionId.size >= RECENT_SELF_JOIN_CHIME_MAX_ENTRIES) {
		const oldestKey = recentSelfJoinChimesByConnectionId.keys().next().value;
		if (oldestKey === undefined) break;
		recentSelfJoinChimesByConnectionId.delete(oldestKey);
	}
}

export function playSelfJoinChimeOnce(connectionId: string | null | undefined, source: SelfJoinChimeSource): void {
	if (VoiceRegionTeleport.shouldSuppressRejoinSounds()) {
		return;
	}
	if (!connectionId) {
		SoundCommands.playSoundBypassingSelfDeafened(SoundType.UserJoin);
		return;
	}

	const now = Date.now();
	pruneRecentSelfJoinChimes(now);
	const recent = recentSelfJoinChimesByConnectionId.get(connectionId);
	if (recent && now - recent.playedAt < SELF_JOIN_CHIME_DEDUPE_WINDOW_MS) return;

	recentSelfJoinChimesByConnectionId.set(connectionId, {playedAt: now, source});
	SoundCommands.playSoundBypassingSelfDeafened(SoundType.UserJoin);
}
