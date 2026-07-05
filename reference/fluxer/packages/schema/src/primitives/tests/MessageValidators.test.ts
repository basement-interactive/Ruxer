// SPDX-License-Identifier: AGPL-3.0-or-later

import {MessageReferenceTypes, MessageTypes} from '@fluxer/constants/src/ChannelConstants';
import {MessageReferenceTypeSchema, MessageTypeSchema} from '@fluxer/schema/src/primitives/MessageValidators';
import {describe, expect, it} from 'vitest';

describe('MessageTypeSchema', () => {
	it('accepts default message type', () => {
		const result = MessageTypeSchema.safeParse(MessageTypes.DEFAULT);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toBe(MessageTypes.DEFAULT);
		}
	});
	it('accepts recipient add message type', () => {
		const result = MessageTypeSchema.safeParse(MessageTypes.RECIPIENT_ADD);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toBe(MessageTypes.RECIPIENT_ADD);
		}
	});
	it('accepts call message type', () => {
		const result = MessageTypeSchema.safeParse(MessageTypes.CALL);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toBe(MessageTypes.CALL);
		}
	});
	it('accepts reply message type', () => {
		const result = MessageTypeSchema.safeParse(MessageTypes.REPLY);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toBe(MessageTypes.REPLY);
		}
	});
	it('rejects non-numeric values', () => {
		const result = MessageTypeSchema.safeParse('invalid');
		expect(result.success).toBe(false);
	});
});

describe('MessageReferenceTypeSchema', () => {
	it('accepts default reference type', () => {
		const result = MessageReferenceTypeSchema.safeParse(MessageReferenceTypes.DEFAULT);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toBe(MessageReferenceTypes.DEFAULT);
		}
	});
	it('accepts forward reference type', () => {
		const result = MessageReferenceTypeSchema.safeParse(MessageReferenceTypes.FORWARD);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toBe(MessageReferenceTypes.FORWARD);
		}
	});
	it('rejects non-numeric values', () => {
		const result = MessageReferenceTypeSchema.safeParse('invalid');
		expect(result.success).toBe(false);
	});
});
