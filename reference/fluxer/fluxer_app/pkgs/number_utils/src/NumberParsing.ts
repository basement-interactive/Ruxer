// SPDX-License-Identifier: AGPL-3.0-or-later

import {DEFAULT_NUMBER_FALLBACK} from '@pkgs/number_utils/src/NumberConstants';
import type {NumberInput} from '@pkgs/number_utils/src/NumberTypes';

export function parseNumberInput(value: NumberInput, fallbackValue: number = DEFAULT_NUMBER_FALLBACK): number {
	if (typeof value === 'number') {
		if (Number.isFinite(value)) {
			return value;
		}
		return fallbackValue;
	}
	if (typeof value === 'string') {
		const trimmedValue = value.trim();
		if (trimmedValue === '') {
			return fallbackValue;
		}
		const parsedValue = Number(trimmedValue);
		if (Number.isFinite(parsedValue)) {
			return parsedValue;
		}
	}
	return fallbackValue;
}
