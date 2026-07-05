// SPDX-License-Identifier: AGPL-3.0-or-later

import {WebhookTypeSchema} from '@fluxer/schema/src/primitives/WebhookValidators';
import {describe, expect, it} from 'vitest';

describe('WebhookTypeSchema', () => {
	it('accepts incoming webhook type', () => {
		const result = WebhookTypeSchema.safeParse(1);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toBe(1);
		}
	});
	it('accepts channel follower webhook type', () => {
		const result = WebhookTypeSchema.safeParse(2);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toBe(2);
		}
	});
	it('rejects non-numeric values', () => {
		const result = WebhookTypeSchema.safeParse('invalid');
		expect(result.success).toBe(false);
	});
});
