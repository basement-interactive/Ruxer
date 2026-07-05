// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	decodeReadStateProto,
	decodeReadStateProtoBundle,
	EMPTY_READ_STATE_PROTO,
	encodeReadStateProto,
	ReadStateProtoDecodeError,
} from '@fluxer/schema/src/domains/read_state/ReadStateProtoCodec';
import {describe, expect, it} from 'vitest';

describe('ReadStateProtoCodec', () => {
	it('encodes the empty bundle to the empty string', () => {
		expect(encodeReadStateProto([])).toBe(EMPTY_READ_STATE_PROTO);
		expect(EMPTY_READ_STATE_PROTO).toBe('');
	});
	it('decodes empty/null/undefined to an empty array', () => {
		expect(decodeReadStateProto('')).toEqual([]);
		expect(decodeReadStateProto(null)).toEqual([]);
		expect(decodeReadStateProto(undefined)).toEqual([]);
	});
	it('round-trips read states without losing optional nulls', () => {
		const encoded = encodeReadStateProto([
			{
				id: '100',
				mention_count: 3,
				last_message_id: '200',
				last_pin_timestamp: '2026-05-15T12:00:00.000Z',
				version: '7',
			},
			{
				id: '101',
				mention_count: 0,
				last_message_id: null,
				last_pin_timestamp: null,
			},
		]);
		expect(encoded).not.toBe('');
		expect(decodeReadStateProto(encoded)).toEqual([
			{
				id: '100',
				mention_count: 3,
				last_message_id: '200',
				last_pin_timestamp: '2026-05-15T12:00:00.000Z',
				version: '7',
			},
			{
				id: '101',
				mention_count: 0,
				last_message_id: null,
				last_pin_timestamp: null,
				version: undefined,
			},
		]);
	});
	it('encodes snowflakes and versions as uint64 and pin times as protobuf timestamps', () => {
		const encoded = encodeReadStateProto([
			{
				id: '100',
				last_message_id: '200',
				last_pin_timestamp: '2026-05-15T12:00:00.000Z',
				version: '7',
			},
		]);
		const bundle = decodeReadStateProtoBundle(encoded);
		expect(bundle.readStates[0]?.channelId).toBe(100n);
		expect(bundle.readStates[0]?.lastMessageId).toBe(200n);
		expect(bundle.readStates[0]?.version).toBe(7n);
		expect(bundle.readStates[0]?.lastPinTimestamp?.seconds).toBe(1778846400n);
	});
	it('rejects invalid base64 with a typed error', () => {
		expect(() => decodeReadStateProto('not_base64!!!')).toThrow(ReadStateProtoDecodeError);
	});
});
