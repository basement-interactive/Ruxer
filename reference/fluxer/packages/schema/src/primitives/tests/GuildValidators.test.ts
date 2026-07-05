// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	GuildExplicitContentFilterTypes,
	GuildMFALevel,
	GuildNSFWLevel,
	GuildSplashCardAlignment,
	GuildVerificationLevel,
	JoinSourceTypes,
} from '@fluxer/constants/src/GuildConstants';
import {MessageNotifications} from '@fluxer/constants/src/NotificationConstants';
import {
	DefaultMessageNotificationsSchema,
	GuildExplicitContentFilterSchema,
	GuildMFALevelSchema,
	GuildVerificationLevelSchema,
	JoinSourceTypeSchema,
	NSFWLevelSchema,
	SplashCardAlignmentSchema,
} from '@fluxer/schema/src/primitives/GuildValidators';
import {describe, expect, it} from 'vitest';

describe('GuildVerificationLevelSchema', () => {
	it('accepts none verification level', () => {
		const result = GuildVerificationLevelSchema.safeParse(GuildVerificationLevel.NONE);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toBe(GuildVerificationLevel.NONE);
		}
	});
	it('accepts low verification level', () => {
		const result = GuildVerificationLevelSchema.safeParse(GuildVerificationLevel.LOW);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toBe(GuildVerificationLevel.LOW);
		}
	});
	it('accepts very high verification level', () => {
		const result = GuildVerificationLevelSchema.safeParse(GuildVerificationLevel.VERY_HIGH);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toBe(GuildVerificationLevel.VERY_HIGH);
		}
	});
});

describe('GuildMFALevelSchema', () => {
	it('accepts none MFA level', () => {
		const result = GuildMFALevelSchema.safeParse(GuildMFALevel.NONE);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toBe(GuildMFALevel.NONE);
		}
	});
	it('accepts elevated MFA level', () => {
		const result = GuildMFALevelSchema.safeParse(GuildMFALevel.ELEVATED);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toBe(GuildMFALevel.ELEVATED);
		}
	});
});

describe('GuildExplicitContentFilterSchema', () => {
	it('accepts disabled filter', () => {
		const result = GuildExplicitContentFilterSchema.safeParse(GuildExplicitContentFilterTypes.DISABLED);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toBe(GuildExplicitContentFilterTypes.DISABLED);
		}
	});
	it('accepts members without roles filter', () => {
		const result = GuildExplicitContentFilterSchema.safeParse(GuildExplicitContentFilterTypes.MEMBERS_WITHOUT_ROLES);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toBe(GuildExplicitContentFilterTypes.MEMBERS_WITHOUT_ROLES);
		}
	});
	it('accepts all members filter', () => {
		const result = GuildExplicitContentFilterSchema.safeParse(GuildExplicitContentFilterTypes.ALL_MEMBERS);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toBe(GuildExplicitContentFilterTypes.ALL_MEMBERS);
		}
	});
});

describe('DefaultMessageNotificationsSchema', () => {
	it('accepts all messages notification level', () => {
		const result = DefaultMessageNotificationsSchema.safeParse(MessageNotifications.ALL_MESSAGES);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toBe(MessageNotifications.ALL_MESSAGES);
		}
	});
	it('accepts only mentions notification level', () => {
		const result = DefaultMessageNotificationsSchema.safeParse(MessageNotifications.ONLY_MENTIONS);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toBe(MessageNotifications.ONLY_MENTIONS);
		}
	});
});

describe('NSFWLevelSchema', () => {
	it('accepts safe NSFW level', () => {
		const result = NSFWLevelSchema.safeParse(GuildNSFWLevel.SAFE);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toBe(GuildNSFWLevel.SAFE);
		}
	});
	it('rejects deprecated explicit NSFW level (1)', () => {
		const result = NSFWLevelSchema.safeParse(1);
		expect(result.success).toBe(false);
	});
	it('rejects deprecated dedicated-safe NSFW level (2)', () => {
		const result = NSFWLevelSchema.safeParse(2);
		expect(result.success).toBe(false);
	});
	it('accepts age-restricted NSFW level', () => {
		const result = NSFWLevelSchema.safeParse(GuildNSFWLevel.AGE_RESTRICTED);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toBe(GuildNSFWLevel.AGE_RESTRICTED);
		}
	});
});

describe('SplashCardAlignmentSchema', () => {
	it('accepts centre alignment', () => {
		const result = SplashCardAlignmentSchema.safeParse(GuildSplashCardAlignment.CENTER);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toBe(GuildSplashCardAlignment.CENTER);
		}
	});
	it('accepts left alignment', () => {
		const result = SplashCardAlignmentSchema.safeParse(GuildSplashCardAlignment.LEFT);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toBe(GuildSplashCardAlignment.LEFT);
		}
	});
	it('accepts right alignment', () => {
		const result = SplashCardAlignmentSchema.safeParse(GuildSplashCardAlignment.RIGHT);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toBe(GuildSplashCardAlignment.RIGHT);
		}
	});
	it('rejects invalid alignments', () => {
		const result = SplashCardAlignmentSchema.safeParse('invalid');
		expect(result.success).toBe(false);
	});
});

describe('JoinSourceTypeSchema', () => {
	it('accepts all valid join source types', () => {
		for (const value of Object.values(JoinSourceTypes)) {
			const result = JoinSourceTypeSchema.safeParse(value);
			expect(result.success).toBe(true);
		}
	});
	it('rejects non-numeric values', () => {
		expect(JoinSourceTypeSchema.safeParse('invalid').success).toBe(false);
	});
});
