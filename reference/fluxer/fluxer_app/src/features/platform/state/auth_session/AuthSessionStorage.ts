// SPDX-License-Identifier: AGPL-3.0-or-later

export const AuthSessionStorageKey = {
	Token: 'token',
	UserId: 'userId',
} as const;

export function parseStoredSessionValue(value: string | null): string | null {
	if (!value || value === 'undefined' || value === 'null') {
		return null;
	}
	return value;
}

export function readStoredSessionUserId(storage: {getItem(key: string): string | null}): string | null {
	try {
		return parseStoredSessionValue(storage.getItem(AuthSessionStorageKey.UserId));
	} catch {
		return null;
	}
}
