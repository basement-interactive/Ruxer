// @vitest-environment happy-dom
// SPDX-License-Identifier: AGPL-3.0-or-later

import {beforeEach, describe, expect, it} from 'vitest';
import {NATIVE_VIDEO_ELEMENT_POOL_MAX, NativeVideoElementPool} from './NativeVideoElementPool';

let pool: NativeVideoElementPool;

beforeEach(() => {
	pool = new NativeVideoElementPool();
});

describe('NativeVideoElementPool', () => {
	it('creates a configured video element per trackSid', () => {
		const element = pool.acquire('TR_1');
		expect(element.tagName.toLowerCase()).toBe('video');
		expect(element.muted).toBe(true);
		expect(element.autoplay).toBe(true);
		expect(pool.size).toBe(1);
	});

	it('reuses the same element across acquisitions for the same trackSid', () => {
		const first = pool.acquire('TR_1');
		const fakeStream = new MediaStream();
		first.srcObject = fakeStream;
		const second = pool.acquire('TR_1');
		expect(second).toBe(first);
		expect(second.srcObject).toBe(fakeStream);
		expect(pool.size).toBe(1);
	});

	it('returns distinct elements for distinct trackSids', () => {
		expect(pool.acquire('TR_1')).not.toBe(pool.acquire('TR_2'));
		expect(pool.size).toBe(2);
	});

	it('bounds the pool to the named cap by evicting the stalest element', () => {
		const first = pool.acquire('TR_0');
		first.srcObject = new MediaStream();
		for (let i = 1; i <= NATIVE_VIDEO_ELEMENT_POOL_MAX; i++) {
			pool.acquire(`TR_${i}`);
		}
		expect(pool.size).toBe(NATIVE_VIDEO_ELEMENT_POOL_MAX);
		expect(pool.has('TR_0')).toBe(false);
		expect(first.srcObject).toBeNull();
		expect(pool.has(`TR_${NATIVE_VIDEO_ELEMENT_POOL_MAX}`)).toBe(true);
	});

	it('keeps recently re-acquired elements resident under eviction pressure', () => {
		pool.acquire('TR_0');
		for (let i = 1; i < NATIVE_VIDEO_ELEMENT_POOL_MAX; i++) {
			pool.acquire(`TR_${i}`);
		}
		pool.acquire('TR_0');
		pool.acquire('TR_extra');
		expect(pool.has('TR_0')).toBe(true);
		expect(pool.has('TR_1')).toBe(false);
		expect(pool.size).toBe(NATIVE_VIDEO_ELEMENT_POOL_MAX);
	});

	it('hands out a disposable element while the pooled element is attached to a host', () => {
		const pooled = pool.acquire('TR_1');
		document.body.appendChild(pooled);
		const disposable = pool.acquire('TR_1');
		expect(disposable).not.toBe(pooled);
		expect(pool.size).toBe(1);
		expect(pool.isPooledFor('TR_1', pooled)).toBe(true);
		expect(pool.isPooledFor('TR_1', disposable)).toBe(false);
		pooled.remove();
	});

	it('returns the pooled element again once it is detached', () => {
		const pooled = pool.acquire('TR_1');
		document.body.appendChild(pooled);
		pool.acquire('TR_1');
		pooled.remove();
		expect(pool.acquire('TR_1')).toBe(pooled);
	});

	it('release detaches the stream and removes the element', () => {
		const element = pool.acquire('TR_1');
		element.srcObject = new MediaStream();
		pool.release('TR_1');
		expect(pool.has('TR_1')).toBe(false);
		expect(element.srcObject).toBeNull();
		expect(pool.size).toBe(0);
	});

	it('release of an unknown trackSid is a no-op', () => {
		expect(() => pool.release('TR_missing')).not.toThrow();
	});

	it('clear releases every pooled element', () => {
		pool.acquire('TR_1');
		pool.acquire('TR_2');
		pool.clear();
		expect(pool.size).toBe(0);
	});
});
