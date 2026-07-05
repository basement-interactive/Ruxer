// SPDX-License-Identifier: AGPL-3.0-or-later

import {shouldMoveToAfkOnTick, shouldMoveToGuildAfkChannel} from '@app/features/voice/engine/VoiceAfkTracking';
import {describe, expect, it} from 'vitest';

describe('voice AFK channel tracking', () => {
	it('moves when inactivity reaches the guild AFK timeout', () => {
		expect(
			shouldMoveToGuildAfkChannel({
				channelId: 'voice-1',
				afkChannelId: 'afk-1',
				afkTimeoutSeconds: 60,
				inactiveDurationMs: 60_000,
			}),
		).toBe(true);
	});
	it('stays in the current voice channel before the guild AFK timeout', () => {
		expect(
			shouldMoveToGuildAfkChannel({
				channelId: 'voice-1',
				afkChannelId: 'afk-1',
				afkTimeoutSeconds: 60,
				inactiveDurationMs: 59_999,
			}),
		).toBe(false);
	});
	it('does not move when already in the AFK channel or AFK is disabled', () => {
		expect(
			shouldMoveToGuildAfkChannel({
				channelId: 'afk-1',
				afkChannelId: 'afk-1',
				afkTimeoutSeconds: 60,
				inactiveDurationMs: 60_000,
			}),
		).toBe(false);
		expect(
			shouldMoveToGuildAfkChannel({
				channelId: 'voice-1',
				afkChannelId: null,
				afkTimeoutSeconds: 60,
				inactiveDurationMs: 60_000,
			}),
		).toBe(false);
		expect(
			shouldMoveToGuildAfkChannel({
				channelId: 'voice-1',
				afkChannelId: 'afk-1',
				afkTimeoutSeconds: 0,
				inactiveDurationMs: 60_000,
			}),
		).toBe(false);
	});
	it('treats a null or undefined afk timeout as disabled', () => {
		expect(
			shouldMoveToGuildAfkChannel({
				channelId: 'voice-1',
				afkChannelId: 'afk-1',
				afkTimeoutSeconds: null,
				inactiveDurationMs: 60_000,
			}),
		).toBe(false);
		expect(
			shouldMoveToGuildAfkChannel({
				channelId: 'voice-1',
				afkChannelId: 'afk-1',
				afkTimeoutSeconds: undefined,
				inactiveDurationMs: 60_000,
			}),
		).toBe(false);
	});
	it('does not move when the afk channel is undefined', () => {
		expect(
			shouldMoveToGuildAfkChannel({
				channelId: 'voice-1',
				afkChannelId: undefined,
				afkTimeoutSeconds: 60,
				inactiveDurationMs: 60_000,
			}),
		).toBe(false);
	});
	it('ignores a negative timeout the same as a disabled one', () => {
		expect(
			shouldMoveToGuildAfkChannel({
				channelId: 'voice-1',
				afkChannelId: 'afk-1',
				afkTimeoutSeconds: -5,
				inactiveDurationMs: 60_000,
			}),
		).toBe(false);
	});
	it('respects fractional-second timeouts at the exact boundary', () => {
		expect(
			shouldMoveToGuildAfkChannel({
				channelId: 'voice-1',
				afkChannelId: 'afk-1',
				afkTimeoutSeconds: 1.5,
				inactiveDurationMs: 1_500,
			}),
		).toBe(true);
		expect(
			shouldMoveToGuildAfkChannel({
				channelId: 'voice-1',
				afkChannelId: 'afk-1',
				afkTimeoutSeconds: 1.5,
				inactiveDurationMs: 1_499,
			}),
		).toBe(false);
	});
});

describe('voice AFK per-tick decision', () => {
	const idleState = {
		channelId: 'voice-1',
		afkChannelId: 'afk-1',
		afkTimeoutSeconds: 60,
		inactiveDurationMs: 60_000,
	} as const;

	it('moves when idle past the timeout and no recent voice activity', () => {
		expect(shouldMoveToAfkOnTick({...idleState, hasRecentVoiceActivity: false})).toBe(true);
	});
	it('never moves while there is recent local voice activity, even past the timeout', () => {
		expect(shouldMoveToAfkOnTick({...idleState, hasRecentVoiceActivity: true})).toBe(false);
	});
	it('does not move before the timeout regardless of voice activity', () => {
		expect(shouldMoveToAfkOnTick({...idleState, inactiveDurationMs: 59_999, hasRecentVoiceActivity: false})).toBe(
			false,
		);
	});
	it('does not move when already in the afk channel', () => {
		expect(shouldMoveToAfkOnTick({...idleState, channelId: 'afk-1', hasRecentVoiceActivity: false})).toBe(false);
	});
	it('does not move when afk is disabled', () => {
		expect(shouldMoveToAfkOnTick({...idleState, afkChannelId: null, hasRecentVoiceActivity: false})).toBe(false);
	});
});
