// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	bumpUsageEntry,
	dedupeBoundedIds,
	isValidUsageKey,
	MAX_TRACKED_USAGE_KEYS,
	MAX_USAGE_COUNT,
	MAX_USAGE_KEY_LENGTH,
	mergeWireUsageMaps,
	rankUsageMap,
	sanitizeUsageEntry,
	sanitizeUsageMap,
	USAGE_FRECENCY_HALF_LIFE_MS,
	type UsageEntry,
	usageFrecencyScore,
} from '@app/features/emoji/state/UsageFrecency';
import {describe, expect, it} from 'vitest';

const NOW = 1_750_000_000_000;

function entry(count: number, lastUsed: number): UsageEntry {
	return {count, lastUsed};
}

describe('usageFrecencyScore', () => {
	it('scores higher counts above lower counts at equal recency', () => {
		expect(usageFrecencyScore(entry(10, NOW), NOW)).toBeGreaterThan(usageFrecencyScore(entry(2, NOW), NOW));
	});

	it('scores recent use above stale use at equal counts', () => {
		const fresh = usageFrecencyScore(entry(5, NOW), NOW);
		const stale = usageFrecencyScore(entry(5, NOW - 30 * 24 * 60 * 60 * 1000), NOW);
		expect(fresh).toBeGreaterThan(stale);
	});

	it('halves the score after one half-life', () => {
		const fresh = usageFrecencyScore(entry(5, NOW), NOW);
		const aged = usageFrecencyScore(entry(5, NOW - USAGE_FRECENCY_HALF_LIFE_MS), NOW);
		expect(aged).toBeCloseTo(fresh / 2, 10);
	});

	it('treats future timestamps as zero age', () => {
		expect(usageFrecencyScore(entry(5, NOW + 60_000), NOW)).toBe(usageFrecencyScore(entry(5, NOW), NOW));
	});

	it('is deterministic for a fixed now', () => {
		const a = usageFrecencyScore(entry(7, NOW - 1234), NOW);
		const b = usageFrecencyScore(entry(7, NOW - 1234), NOW);
		expect(a).toBe(b);
	});
});

describe('sanitizeUsageEntry', () => {
	it('passes through sane entries unchanged', () => {
		expect(sanitizeUsageEntry(entry(3, NOW - 1000), NOW)).toEqual(entry(3, NOW - 1000));
	});

	it('drops non-finite and non-positive counts', () => {
		expect(sanitizeUsageEntry(entry(Number.NaN, NOW), NOW)).toBeNull();
		expect(sanitizeUsageEntry(entry(Number.POSITIVE_INFINITY, NOW), NOW)).toBeNull();
		expect(sanitizeUsageEntry(entry(0, NOW), NOW)).toBeNull();
		expect(sanitizeUsageEntry(entry(-5, NOW), NOW)).toBeNull();
	});

	it('drops entries with non-finite timestamps', () => {
		expect(sanitizeUsageEntry(entry(3, Number.NaN), NOW)).toBeNull();
	});

	it('clamps counts to the maximum', () => {
		expect(sanitizeUsageEntry(entry(MAX_USAGE_COUNT * 2, NOW), NOW)?.count).toBe(MAX_USAGE_COUNT);
	});

	it('clamps future timestamps to now and negative timestamps to zero', () => {
		expect(sanitizeUsageEntry(entry(3, NOW + 999_999), NOW)?.lastUsed).toBe(NOW);
		expect(sanitizeUsageEntry(entry(3, -50), NOW)?.lastUsed).toBe(0);
	});

	it('is idempotent', () => {
		const once = sanitizeUsageEntry(entry(3.7, NOW + 5000), NOW);
		expect(once).not.toBeNull();
		expect(sanitizeUsageEntry(once!, NOW)).toEqual(once);
	});
});

describe('bumpUsageEntry', () => {
	it('starts at one for unseen keys', () => {
		expect(bumpUsageEntry(undefined, NOW)).toEqual(entry(1, NOW));
	});

	it('increments and refreshes recency', () => {
		expect(bumpUsageEntry(entry(4, NOW - 1000), NOW)).toEqual(entry(5, NOW));
	});

	it('saturates at the maximum count', () => {
		expect(bumpUsageEntry(entry(MAX_USAGE_COUNT, NOW - 1000), NOW)).toEqual(entry(MAX_USAGE_COUNT, NOW));
	});
});

describe('sanitizeUsageMap', () => {
	it('drops invalid keys and entries', () => {
		const sanitized = sanitizeUsageMap(
			{
				'': entry(3, NOW),
				['x'.repeat(MAX_USAGE_KEY_LENGTH + 1)]: entry(3, NOW),
				'unicode:bad': entry(0, NOW),
				'unicode:good': entry(2, NOW - 500),
			},
			NOW,
		);
		expect(Object.keys(sanitized)).toEqual(['unicode:good']);
	});

	it('prunes the lowest-scoring entries beyond the cap', () => {
		const usage: Record<string, UsageEntry> = {};
		for (let i = 0; i < MAX_TRACKED_USAGE_KEYS + 50; i++) {
			usage[`unicode:e${i}`] = entry(i + 1, NOW - i * 1000);
		}
		const sanitized = sanitizeUsageMap(usage, NOW);
		expect(Object.keys(sanitized)).toHaveLength(MAX_TRACKED_USAGE_KEYS);
		expect(sanitized[`unicode:e${MAX_TRACKED_USAGE_KEYS + 49}`]).toBeDefined();
		expect(sanitized['unicode:e0']).toBeUndefined();
	});

	it('is idempotent on already-sane maps', () => {
		const usage = {
			'unicode:a': entry(3, NOW - 100),
			'unicode:b': entry(9, NOW - 50),
		};
		const once = sanitizeUsageMap(usage, NOW);
		expect(sanitizeUsageMap(once, NOW + 1000)).toEqual(once);
	});
});

describe('rankUsageMap', () => {
	it('ranks by score descending', () => {
		const ranking = rankUsageMap(
			{
				'unicode:rare': entry(1, NOW - 20 * 24 * 60 * 60 * 1000),
				'unicode:hot': entry(20, NOW),
				'unicode:warm': entry(5, NOW - 1000),
			},
			NOW,
			1,
		);
		expect(ranking.rankedKeys).toEqual(['unicode:hot', 'unicode:warm', 'unicode:rare']);
		expect(ranking.version).toBe(1);
		expect(ranking.scoreByKey.get('unicode:hot')).toBeGreaterThan(ranking.scoreByKey.get('unicode:warm')!);
	});

	it('breaks score ties by recency, then count, then key', () => {
		const ranking = rankUsageMap(
			{
				'unicode:b': entry(3, NOW),
				'unicode:a': entry(3, NOW),
				'unicode:newer': entry(3, NOW + 1),
			},
			NOW,
			1,
		);
		expect(ranking.rankedKeys[0]).toBe('unicode:newer');
		expect(ranking.rankedKeys.slice(1)).toEqual(['unicode:a', 'unicode:b']);
	});

	it('produces identical rankings for identical inputs', () => {
		const usage = {
			'unicode:a': entry(3, NOW - 5000),
			'unicode:b': entry(7, NOW - 9000),
			'unicode:c': entry(1, NOW - 100),
		};
		const first = rankUsageMap(usage, NOW, 1);
		const second = rankUsageMap(usage, NOW, 2);
		expect(second.rankedKeys).toEqual(first.rankedKeys);
	});

	it('returns frozen rankings', () => {
		const ranking = rankUsageMap({'unicode:a': entry(1, NOW)}, NOW, 1);
		expect(Object.isFrozen(ranking)).toBe(true);
		expect(Object.isFrozen(ranking.rankedKeys)).toBe(true);
	});
});

describe('mergeWireUsageMaps', () => {
	it('takes the maximum count and recency per key', () => {
		const merged = mergeWireUsageMaps(
			{
				'unicode:a': {count: 5, lastUsedMs: BigInt(NOW - 1000)},
				'unicode:local': {count: 2, lastUsedMs: BigInt(NOW)},
			},
			{
				'unicode:a': {count: 3, lastUsedMs: BigInt(NOW)},
				'unicode:remote': {count: 9, lastUsedMs: BigInt(NOW - 50)},
			},
			NOW,
		);
		expect(merged['unicode:a']).toEqual({count: 5, lastUsedMs: BigInt(NOW)});
		expect(merged['unicode:local']).toEqual({count: 2, lastUsedMs: BigInt(NOW)});
		expect(merged['unicode:remote']).toEqual({count: 9, lastUsedMs: BigInt(NOW - 50)});
	});

	it('is idempotent when merging a map with itself', () => {
		const map = {
			'unicode:a': {count: 5, lastUsedMs: BigInt(NOW - 1000)},
			'unicode:b': {count: 1, lastUsedMs: BigInt(NOW - 2000)},
		};
		expect(mergeWireUsageMaps(map, map, NOW)).toEqual(map);
	});

	it('bounds the merged result', () => {
		const local: Record<string, {count: number; lastUsedMs: bigint}> = {};
		const incoming: Record<string, {count: number; lastUsedMs: bigint}> = {};
		for (let i = 0; i < MAX_TRACKED_USAGE_KEYS; i++) {
			local[`unicode:l${i}`] = {count: i + 1, lastUsedMs: BigInt(NOW)};
			incoming[`unicode:r${i}`] = {count: i + 1, lastUsedMs: BigInt(NOW)};
		}
		const merged = mergeWireUsageMaps(local, incoming, NOW);
		expect(Object.keys(merged)).toHaveLength(MAX_TRACKED_USAGE_KEYS);
	});

	it('drops junk entries from either side', () => {
		const merged = mergeWireUsageMaps(
			{'unicode:ok': {count: 1, lastUsedMs: BigInt(NOW)}},
			{'': {count: 1, lastUsedMs: BigInt(NOW)}, 'unicode:zero': {count: 0, lastUsedMs: BigInt(NOW)}},
			NOW,
		);
		expect(Object.keys(merged)).toEqual(['unicode:ok']);
	});
});

describe('isValidUsageKey', () => {
	it('rejects empty and oversized keys', () => {
		expect(isValidUsageKey('')).toBe(false);
		expect(isValidUsageKey('x'.repeat(MAX_USAGE_KEY_LENGTH))).toBe(true);
		expect(isValidUsageKey('x'.repeat(MAX_USAGE_KEY_LENGTH + 1))).toBe(false);
	});
});

describe('dedupeBoundedIds', () => {
	it('preserves order, removes duplicates, and applies the cap', () => {
		expect(dedupeBoundedIds(['a', 'b', 'a', 'c', 'b', 'd'], 3)).toEqual(['a', 'b', 'c']);
	});

	it('drops empty and oversized ids', () => {
		expect(dedupeBoundedIds(['', 'ok', 'x'.repeat(MAX_USAGE_KEY_LENGTH + 1)], 10)).toEqual(['ok']);
	});
});
