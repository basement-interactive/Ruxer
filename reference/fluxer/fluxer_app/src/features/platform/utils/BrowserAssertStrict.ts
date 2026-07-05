// SPDX-License-Identifier: AGPL-3.0-or-later

function messageOrDefault(message: string | Error | undefined, fallback: string): string | Error {
	return message ?? fallback;
}

export function ok(value: unknown, message?: string | Error): asserts value {
	if (!value) {
		throw new Error(String(messageOrDefault(message, 'Assertion failed')));
	}
}

export function equal(actual: unknown, expected: unknown, message?: string | Error): void {
	if (actual !== expected) {
		throw new Error(
			String(messageOrDefault(message, `Expected ${String(actual)} to strictly equal ${String(expected)}`)),
		);
	}
}

export function notEqual(actual: unknown, expected: unknown, message?: string | Error): void {
	if (actual === expected) {
		throw new Error(
			String(messageOrDefault(message, `Expected ${String(actual)} to not strictly equal ${String(expected)}`)),
		);
	}
}

export function fail(message?: string | Error): never {
	throw new Error(String(messageOrDefault(message, 'Assertion failed')));
}

const assert = {
	ok,
	equal,
	strictEqual: equal,
	notEqual,
	notStrictEqual: notEqual,
	fail,
};

export default assert;
