// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	countDistinctCameraUsers,
	isCameraUserCapBlocked,
	type VoiceCameraCapacityVoiceState,
} from '@app/features/voice/utils/VoiceCameraCapacity';
import {VOICE_CHANNEL_CAMERA_USER_LIMIT} from '@fluxer/constants/src/LimitConstants';
import {describe, expect, it} from 'vitest';

function buildVoiceStates(
	cameraUserCount: number,
	options: {extraConnectionsForUser?: string; nonCameraUserCount?: number} = {},
): Record<string, VoiceCameraCapacityVoiceState> {
	const voiceStates: Record<string, VoiceCameraCapacityVoiceState> = {};
	for (let i = 0; i < cameraUserCount; i++) {
		voiceStates[`conn-camera-${i}`] = {user_id: `user-${i}`, self_video: true};
	}
	for (let i = 0; i < (options.nonCameraUserCount ?? 0); i++) {
		voiceStates[`conn-idle-${i}`] = {user_id: `idle-user-${i}`, self_video: false};
	}
	if (options.extraConnectionsForUser) {
		voiceStates['conn-extra-1'] = {user_id: options.extraConnectionsForUser, self_video: true};
		voiceStates['conn-extra-2'] = {user_id: options.extraConnectionsForUser, self_video: true};
	}
	return voiceStates;
}

describe('countDistinctCameraUsers', () => {
	it('counts only users with self_video enabled', () => {
		expect(countDistinctCameraUsers(buildVoiceStates(3, {nonCameraUserCount: 5}))).toBe(3);
	});

	it('counts a user with multiple camera connections once', () => {
		expect(countDistinctCameraUsers(buildVoiceStates(2, {extraConnectionsForUser: 'multi-user'}))).toBe(3);
	});

	it('ignores voice states without a self_video flag', () => {
		expect(countDistinctCameraUsers({'conn-1': {user_id: 'user-1'}})).toBe(0);
	});

	it('returns zero for an empty channel', () => {
		expect(countDistinctCameraUsers({})).toBe(0);
	});
});

describe('isCameraUserCapBlocked', () => {
	it('does not block below the limit', () => {
		expect(
			isCameraUserCapBlocked({
				voiceStates: buildVoiceStates(VOICE_CHANNEL_CAMERA_USER_LIMIT - 1),
				currentUserId: 'someone-else',
				isOwnCameraEnabled: false,
			}),
		).toBe(false);
	});

	it('blocks exactly at the limit', () => {
		expect(
			isCameraUserCapBlocked({
				voiceStates: buildVoiceStates(VOICE_CHANNEL_CAMERA_USER_LIMIT),
				currentUserId: 'someone-else',
				isOwnCameraEnabled: false,
			}),
		).toBe(true);
	});

	it('never blocks turning the camera off', () => {
		expect(
			isCameraUserCapBlocked({
				voiceStates: buildVoiceStates(VOICE_CHANNEL_CAMERA_USER_LIMIT),
				currentUserId: 'someone-else',
				isOwnCameraEnabled: true,
			}),
		).toBe(false);
	});

	it('exempts the current user when their own camera is already counted in voice states', () => {
		const voiceStates = buildVoiceStates(VOICE_CHANNEL_CAMERA_USER_LIMIT);
		expect(
			isCameraUserCapBlocked({
				voiceStates,
				currentUserId: 'user-0',
				isOwnCameraEnabled: false,
			}),
		).toBe(false);
	});

	it('counts a multi-connection user once when evaluating the cap', () => {
		const voiceStates = buildVoiceStates(VOICE_CHANNEL_CAMERA_USER_LIMIT - 2, {
			extraConnectionsForUser: 'multi-user',
		});
		expect(
			isCameraUserCapBlocked({
				voiceStates,
				currentUserId: 'someone-else',
				isOwnCameraEnabled: false,
			}),
		).toBe(false);
	});

	it('supports an explicit limit override', () => {
		expect(
			isCameraUserCapBlocked({
				voiceStates: buildVoiceStates(2),
				currentUserId: 'someone-else',
				isOwnCameraEnabled: false,
				limit: 2,
			}),
		).toBe(true);
	});
});
