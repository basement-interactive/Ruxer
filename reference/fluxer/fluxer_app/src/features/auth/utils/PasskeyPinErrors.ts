// SPDX-License-Identifier: AGPL-3.0-or-later

export type PasskeyPinFailure =
	| {kind: 'required'}
	| {kind: 'invalid'; retriesRemaining: number | null}
	| {kind: 'auth-blocked'}
	| {kind: 'blocked'}
	| {kind: 'not-set'};

export function parsePasskeyPinFailure(error: unknown): PasskeyPinFailure | null {
	const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
	if (!message) {
		return null;
	}
	const invalid = message.match(/\bPinInvalid\b(?: retriesRemaining=(\d+))?/);
	if (invalid) {
		return {kind: 'invalid', retriesRemaining: invalid[1] != null ? Number(invalid[1]) : null};
	}
	if (/\bPinRequired\b/.test(message)) {
		return {kind: 'required'};
	}
	if (/\bPinAuthBlocked\b/.test(message)) {
		return {kind: 'auth-blocked'};
	}
	if (/\bPinBlocked\b/.test(message)) {
		return {kind: 'blocked'};
	}
	if (/\bPinNotSet\b/.test(message)) {
		return {kind: 'not-set'};
	}
	return null;
}

export function createPasskeyCancelledError(): Error {
	const error = new Error('The passkey operation was cancelled.');
	error.name = 'NotAllowedError';
	return error;
}
