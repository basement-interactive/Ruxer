// SPDX-License-Identifier: AGPL-3.0-or-later

import {MAX_TEMP_BAN_DURATION_SECONDS, MIN_TEMP_BAN_DURATION_SECONDS} from '@fluxer/constants/src/LimitConstants';
import {GuildBanCreateRequest} from '@fluxer/schema/src/domains/guild/GuildRequestSchemas';
import {describe, expect, it} from 'vitest';

describe('GuildBanCreateRequest', () => {
	it('accepts permanent bans and arbitrary temporary durations within range', () => {
		expect(GuildBanCreateRequest.safeParse({ban_duration_seconds: 0}).success).toBe(true);
		expect(GuildBanCreateRequest.safeParse({ban_duration_seconds: MIN_TEMP_BAN_DURATION_SECONDS}).success).toBe(true);
		expect(GuildBanCreateRequest.safeParse({ban_duration_seconds: 3601}).success).toBe(true);
		expect(GuildBanCreateRequest.safeParse({ban_duration_seconds: MAX_TEMP_BAN_DURATION_SECONDS}).success).toBe(true);
	});
	it('rejects temporary ban durations outside the allowed range', () => {
		expect(GuildBanCreateRequest.safeParse({ban_duration_seconds: MIN_TEMP_BAN_DURATION_SECONDS - 1}).success).toBe(
			false,
		);
		expect(GuildBanCreateRequest.safeParse({ban_duration_seconds: MAX_TEMP_BAN_DURATION_SECONDS + 1}).success).toBe(
			false,
		);
	});
});
