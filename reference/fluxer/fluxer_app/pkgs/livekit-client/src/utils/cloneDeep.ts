// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0
export function cloneDeep<T>(value: T): T {
	if (typeof value === 'undefined') {
		return value as T;
	}

	if (typeof structuredClone === 'function') {
		if (typeof value === 'object' && value !== null) {
			return structuredClone({...value});
		}
		return structuredClone(value);
	} else {
		return JSON.parse(JSON.stringify(value)) as T;
	}
}
