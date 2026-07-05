// SPDX-License-Identifier: AGPL-3.0-or-later

export class LRUMap<K, V> {
	private readonly store = new Map<K, V>();

	constructor(private readonly capacity: number) {
		if (!Number.isInteger(capacity) || capacity <= 0) {
			throw new Error(`LRUMap capacity must be a positive integer (got ${capacity})`);
		}
	}

	get size(): number {
		return this.store.size;
	}

	has(key: K): boolean {
		return this.store.has(key);
	}

	get(key: K): V | undefined {
		const value = this.store.get(key);
		if (value === undefined) {
			return undefined;
		}
		this.store.delete(key);
		this.store.set(key, value);
		return value;
	}

	peek(key: K): V | undefined {
		return this.store.get(key);
	}

	set(key: K, value: V): void {
		if (this.store.has(key)) {
			this.store.delete(key);
		} else if (this.store.size >= this.capacity) {
			const oldest = this.store.keys().next().value;
			if (oldest !== undefined) {
				this.store.delete(oldest);
			}
		}
		this.store.set(key, value);
	}

	delete(key: K): boolean {
		return this.store.delete(key);
	}

	clear(): void {
		this.store.clear();
	}

	keys(): IterableIterator<K> {
		return this.store.keys();
	}

	values(): IterableIterator<V> {
		return this.store.values();
	}

	entries(): IterableIterator<[K, V]> {
		return this.store.entries();
	}
}
