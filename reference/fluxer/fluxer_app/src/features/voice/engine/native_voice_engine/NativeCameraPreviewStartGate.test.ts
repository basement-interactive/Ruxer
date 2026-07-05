// SPDX-License-Identifier: AGPL-3.0-or-later

import {describe, expect, it} from 'vitest';
import {NativeCameraPreviewStartGate} from './NativeCameraPreviewStartGate';

interface Deferred<T> {
	promise: Promise<T>;
	resolve: (value: T) => void;
}

function createDeferred<T>(): Deferred<T> {
	let resolveValue: ((value: T) => void) | null = null;
	const promise = new Promise<T>((resolve) => {
		resolveValue = resolve;
	});
	if (!resolveValue) {
		throw new Error('Failed to create deferred promise');
	}
	return {promise, resolve: resolveValue};
}

describe('NativeCameraPreviewStartGate', () => {
	it('lets only the latest waiting start run after an in-flight start settles', async () => {
		const gate = new NativeCameraPreviewStartGate();
		const calls: Array<string> = [];
		const firstStart = createDeferred<string>();

		const firstGeneration = gate.nextGeneration();
		const first = gate.runLatest(firstGeneration, () => {
			calls.push('first');
			return firstStart.promise;
		});
		await Promise.resolve();

		const staleGeneration = gate.nextGeneration();
		const stale = gate.runLatest(staleGeneration, async () => {
			calls.push('stale');
			return 'stale';
		});
		const latestGeneration = gate.nextGeneration();
		const latest = gate.runLatest(latestGeneration, async () => {
			calls.push('latest');
			return 'latest';
		});

		firstStart.resolve('first');

		await expect(first).resolves.toBe('first');
		await expect(stale).resolves.toBeNull();
		await expect(latest).resolves.toBe('latest');
		expect(calls).toEqual(['first', 'latest']);
	});

	it('invalidates a waiting start without running its operation', async () => {
		const gate = new NativeCameraPreviewStartGate();
		const calls: Array<string> = [];
		const firstStart = createDeferred<string>();

		const firstGeneration = gate.nextGeneration();
		const first = gate.runLatest(firstGeneration, () => {
			calls.push('first');
			return firstStart.promise;
		});
		await Promise.resolve();

		const waitingGeneration = gate.nextGeneration();
		const waiting = gate.runLatest(waitingGeneration, async () => {
			calls.push('waiting');
			return 'waiting';
		});
		gate.invalidate();
		firstStart.resolve('first');

		await expect(first).resolves.toBe('first');
		await expect(waiting).resolves.toBeNull();
		expect(calls).toEqual(['first']);
	});

	it('clears rejected starts so a later generation can run', async () => {
		const gate = new NativeCameraPreviewStartGate();
		const failingGeneration = gate.nextGeneration();
		const failure = new Error('camera failed');

		await expect(
			gate.runLatest(failingGeneration, async () => {
				throw failure;
			}),
		).rejects.toBe(failure);

		const nextGeneration = gate.nextGeneration();
		await expect(gate.runLatest(nextGeneration, async () => 'next')).resolves.toBe('next');
	});
});
