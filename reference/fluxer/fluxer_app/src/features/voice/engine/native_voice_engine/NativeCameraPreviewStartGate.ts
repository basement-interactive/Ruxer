// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';

export class NativeCameraPreviewStartGate {
	private generation = 0;
	private inFlight: Promise<void> | null = null;

	nextGeneration(): number {
		this.generation += 1;
		assert.ok(Number.isInteger(this.generation), 'native camera preview generation must be an integer');
		assert.ok(this.generation > 0, 'native camera preview generation must be positive');
		return this.generation;
	}

	invalidate(): void {
		this.generation += 1;
		assert.ok(Number.isInteger(this.generation), 'native camera preview generation must be an integer');
		assert.ok(this.generation > 0, 'native camera preview generation must be positive');
	}

	isCurrent(generation: number): boolean {
		assert.ok(Number.isInteger(generation), 'native camera preview generation must be an integer');
		assert.ok(generation > 0, 'native camera preview generation must be positive');
		return generation === this.generation;
	}

	async runLatest<T>(generation: number, operation: () => Promise<T>): Promise<T | null> {
		assert.ok(Number.isInteger(generation), 'native camera preview generation must be an integer');
		assert.ok(generation > 0, 'native camera preview generation must be positive');
		const previousInFlight = this.inFlight;
		if (previousInFlight) {
			await previousInFlight;
		}
		if (!this.isCurrent(generation)) {
			return null;
		}
		const startOperation = Promise.resolve().then(operation);
		const inFlight = startOperation.then(
			() => undefined,
			() => undefined,
		);
		this.inFlight = inFlight;
		try {
			return await startOperation;
		} finally {
			if (this.inFlight === inFlight) {
				this.inFlight = null;
			}
		}
	}
}
