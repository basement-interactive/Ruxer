// SPDX-License-Identifier: AGPL-3.0-or-later

interface HighlightRegistry {
	clear(): void;
	delete(name: string): boolean;
	entries(): IterableIterator<[string, Highlight]>;
	get(name: string): Highlight | undefined;
	has(name: string): boolean;
	keys(): IterableIterator<string>;
	set(name: string, highlight: Highlight): HighlightRegistry;
	values(): IterableIterator<Highlight>;
	[Symbol.iterator](): IterableIterator<[string, Highlight]>;
}

interface RTCStatsReport {
	entries(): IterableIterator<[string, RTCStats]>;
	get(key: string): RTCStats | undefined;
	has(key: string): boolean;
	keys(): IterableIterator<string>;
	values(): IterableIterator<RTCStats>;
	[Symbol.iterator](): IterableIterator<[string, RTCStats]>;
}
