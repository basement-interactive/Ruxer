// SPDX-License-Identifier: AGPL-3.0-or-later

import {describe, expect, it} from 'vitest';
import {resolveGuildModerationCapabilities} from './GuildModerationCapabilityUtils';

describe('resolveGuildModerationCapabilities', () => {
	const baseOptions = {
		isCurrentUser: false,
		canManageTarget: true,
		canKickMembers: false,
		canBanMembers: false,
		canModerateMembers: true,
		targetHasAdministratorPermission: false,
	};

	it('allows timing out manageable non-administrator targets', () => {
		const capabilities = resolveGuildModerationCapabilities(baseOptions);

		expect(capabilities.canTimeout).toBe(true);
	});

	it('prevents timing out administrators', () => {
		const capabilities = resolveGuildModerationCapabilities({
			...baseOptions,
			targetHasAdministratorPermission: true,
		});

		expect(capabilities.canTimeout).toBe(false);
	});
});
