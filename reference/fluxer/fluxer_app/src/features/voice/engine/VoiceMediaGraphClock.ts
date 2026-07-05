// SPDX-License-Identifier: AGPL-3.0-or-later

export interface VoiceMediaGraphClockPort {
	now(): number;
}

export const systemVoiceMediaGraphClock: VoiceMediaGraphClockPort = {
	now: () => Date.now(),
};
