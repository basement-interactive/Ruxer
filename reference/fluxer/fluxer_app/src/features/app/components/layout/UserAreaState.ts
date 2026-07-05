// SPDX-License-Identifier: AGPL-3.0-or-later

export type UserAreaMuteReason = 'guild' | 'voice_push_to_talk' | 'self' | 'permission' | null;

export interface UserAreaMicrophoneSignals {
	effectiveAudioMuted: boolean;
	effectiveAudioDeafened: boolean;
	isGuildMuted: boolean;
	isGuildDeafened: boolean;
	isPermissionMuted: boolean;
	muteReason: UserAreaMuteReason;
	isPushToTalkEffective: boolean;
	isPushToTalkHeld: boolean;
	isPushToMuteEffective: boolean;
	isPushToMuteHeld: boolean;
}

export interface UserAreaMicrophoneState {
	effectiveMuted: boolean;
	muteToggleLocked: boolean;
}

export function selectUserAreaMicrophoneState(signals: UserAreaMicrophoneSignals): UserAreaMicrophoneState {
	const hardMuted =
		signals.effectiveAudioDeafened ||
		signals.isGuildMuted ||
		signals.isGuildDeafened ||
		signals.isPermissionMuted ||
		signals.muteReason === 'guild' ||
		signals.muteReason === 'permission';
	const muteToggleLocked = signals.isGuildMuted || signals.isGuildDeafened || signals.isPermissionMuted;
	if (hardMuted) {
		return {
			effectiveMuted: true,
			muteToggleLocked: muteToggleLocked || signals.isPushToTalkEffective,
		};
	}
	if (signals.isPushToTalkEffective) {
		return {
			effectiveMuted: !signals.isPushToTalkHeld,
			muteToggleLocked: true,
		};
	}
	return {
		effectiveMuted:
			signals.effectiveAudioMuted ||
			signals.muteReason !== null ||
			(signals.isPushToMuteEffective && signals.isPushToMuteHeld),
		muteToggleLocked,
	};
}
