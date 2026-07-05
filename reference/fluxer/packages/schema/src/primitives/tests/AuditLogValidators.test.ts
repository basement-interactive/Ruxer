// SPDX-License-Identifier: AGPL-3.0-or-later

import {AuditLogActionType} from '@fluxer/constants/src/AuditLogActionType';
import {AuditLogActionTypeSchema} from '@fluxer/schema/src/primitives/AuditLogValidators';
import {describe, expect, it} from 'vitest';

describe('AuditLogActionTypeSchema', () => {
	it('accepts valid audit log action types', () => {
		const result = AuditLogActionTypeSchema.safeParse(AuditLogActionType.GUILD_UPDATE);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toBe(AuditLogActionType.GUILD_UPDATE);
		}
	});
	it('accepts channel action types', () => {
		const result = AuditLogActionTypeSchema.safeParse(AuditLogActionType.CHANNEL_CREATE);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toBe(AuditLogActionType.CHANNEL_CREATE);
		}
	});
	it('accepts member action types', () => {
		const result = AuditLogActionTypeSchema.safeParse(AuditLogActionType.MEMBER_KICK);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toBe(AuditLogActionType.MEMBER_KICK);
		}
	});
	it('accepts role action types', () => {
		const result = AuditLogActionTypeSchema.safeParse(AuditLogActionType.ROLE_CREATE);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toBe(AuditLogActionType.ROLE_CREATE);
		}
	});
	it('accepts message action types', () => {
		const result = AuditLogActionTypeSchema.safeParse(AuditLogActionType.MESSAGE_DELETE);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toBe(AuditLogActionType.MESSAGE_DELETE);
		}
	});
	it('rejects non-numeric values', () => {
		const result = AuditLogActionTypeSchema.safeParse('invalid');
		expect(result.success).toBe(false);
	});
});
