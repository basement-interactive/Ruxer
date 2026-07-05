// SPDX-License-Identifier: AGPL-3.0-or-later

export interface VoiceEngineV2ClockPort {
	now(): number;
}

export interface VoiceEngineV2RandomPort {
	next(): number;
}

export interface VoiceEngineV2PlatformPort {
	clock: VoiceEngineV2ClockPort;
	random: VoiceEngineV2RandomPort;
}

export interface VoiceEngineV2WallClockSource {
	read(): number;
}

export interface VoiceEngineV2EntropySource {
	read(): number;
}

export interface VoiceEngineV2SystemClockPort extends VoiceEngineV2ClockPort {
	readonly sourceFailureCount: number;
}

export interface VoiceEngineV2SystemRandomPort extends VoiceEngineV2RandomPort {
	readonly sourceFailureCount: number;
}

const PLATFORM_CLOCK_MAX_MS = Number.MAX_SAFE_INTEGER;
const PLATFORM_RANDOM_MIN = 0;
const PLATFORM_RANDOM_LIMIT = 1;

interface PlatformSourceFailureLatch {
	count: number;
	logged: boolean;
	message: string;
}

function createPlatformSourceFailureLatch(message: string): PlatformSourceFailureLatch {
	return {count: 0, logged: false, message};
}

function recordPlatformSourceFailure(latch: PlatformSourceFailureLatch, error: unknown): void {
	latch.count += 1;
	if (latch.logged) return;
	latch.logged = true;
	globalThis.console.error(latch.message, error);
}

export function createVoiceEngineV2SystemClockPort(
	source?: VoiceEngineV2WallClockSource,
): VoiceEngineV2SystemClockPort {
	const reader = source ?? defaultSystemWallClockSource();
	const failureLatch = createPlatformSourceFailureLatch(
		'voice engine v2 wall clock source threw (programmer error); pinning clock readings to the last safe value',
	);
	let lastValue = -1;
	return {
		get sourceFailureCount(): number {
			return failureLatch.count;
		},
		now(): number {
			const raw = readClockSourceSafely(reader, failureLatch);
			const safe = clampPlatformClockReading(raw, lastValue);
			lastValue = safe;
			return safe;
		},
	};
}

export function createVoiceEngineV2SystemRandomPort(
	source?: VoiceEngineV2EntropySource,
): VoiceEngineV2SystemRandomPort {
	const reader = source ?? defaultSystemEntropySource();
	const failureLatch = createPlatformSourceFailureLatch(
		'voice engine v2 entropy source threw (programmer error); pinning random readings to the minimum value',
	);
	return {
		get sourceFailureCount(): number {
			return failureLatch.count;
		},
		next(): number {
			const raw = readEntropySourceSafely(reader, failureLatch);
			return clampPlatformRandomReading(raw);
		},
	};
}

export function createVoiceEngineV2SystemPlatformPort(): VoiceEngineV2PlatformPort {
	return {
		clock: createVoiceEngineV2SystemClockPort(),
		random: createVoiceEngineV2SystemRandomPort(),
	};
}

export function createVoiceEngineV2DeterministicClockPort(start = 0, stepMs = 1): VoiceEngineV2ClockPort {
	let value = start;
	return {
		now(): number {
			const current = value;
			value += stepMs;
			return current;
		},
	};
}

export function createVoiceEngineV2SeededRandomPort(seed: number): VoiceEngineV2RandomPort {
	let state = normaliseSeed(seed);
	return {
		next(): number {
			state = advanceSeededState(state);
			return state / SEEDED_MODULUS;
		},
	};
}

export function createVoiceEngineV2DeterministicPlatformPort(seed = 0): VoiceEngineV2PlatformPort {
	return {
		clock: createVoiceEngineV2DeterministicClockPort(0, 1),
		random: createVoiceEngineV2SeededRandomPort(seed),
	};
}

function defaultSystemWallClockSource(): VoiceEngineV2WallClockSource {
	return {
		read(): number {
			return globalThis.Date.now();
		},
	};
}

function defaultSystemEntropySource(): VoiceEngineV2EntropySource {
	return {
		read(): number {
			return globalThis.Math.random();
		},
	};
}

function readClockSourceSafely(reader: VoiceEngineV2WallClockSource, latch: PlatformSourceFailureLatch): number {
	try {
		return reader.read();
	} catch (error) {
		recordPlatformSourceFailure(latch, error);
		return 0;
	}
}

function readEntropySourceSafely(reader: VoiceEngineV2EntropySource, latch: PlatformSourceFailureLatch): number {
	try {
		return reader.read();
	} catch (error) {
		recordPlatformSourceFailure(latch, error);
		return PLATFORM_RANDOM_MIN;
	}
}

function clampPlatformClockReading(raw: number, lastValue: number): number {
	if (!Number.isFinite(raw)) return Math.max(lastValue, 0);
	if (raw < 0) return Math.max(lastValue, 0);
	if (raw > PLATFORM_CLOCK_MAX_MS) return PLATFORM_CLOCK_MAX_MS;
	if (raw < lastValue) return lastValue;
	return Math.trunc(raw);
}

const PLATFORM_RANDOM_LARGEST_BELOW_ONE = 0.9999999999999999;

function clampPlatformRandomReading(raw: number): number {
	if (!Number.isFinite(raw)) return PLATFORM_RANDOM_MIN;
	if (raw < PLATFORM_RANDOM_MIN) return PLATFORM_RANDOM_MIN;
	if (raw >= PLATFORM_RANDOM_LIMIT) return PLATFORM_RANDOM_LARGEST_BELOW_ONE;
	return raw;
}

const SEEDED_MODULUS = 2 ** 31 - 1;
const SEEDED_MULTIPLIER = 48_271;

function normaliseSeed(seed: number): number {
	if (!Number.isFinite(seed)) return 1;
	const truncated = Math.trunc(seed);
	const positive = truncated <= 0 ? 1 : truncated;
	return positive % SEEDED_MODULUS;
}

function advanceSeededState(state: number): number {
	const product = state * SEEDED_MULTIPLIER;
	const next = product % SEEDED_MODULUS;
	return next === 0 ? 1 : next;
}
