// SPDX-License-Identifier: AGPL-3.0-or-later

import type {DateInput} from '@fluxer/date_utils/src/DateTypes';

export function parseDate(input: DateInput): Date {
	if (input instanceof Date) {
		if (Number.isNaN(input.getTime())) {
			return new Date();
		}
		return input;
	}
	if (typeof input === 'string') {
		const date = new Date(input);
		if (Number.isNaN(date.getTime())) {
			return new Date();
		}
		return date;
	}
	if (input == null || Number.isNaN(input)) {
		return new Date();
	}
	return new Date(input);
}
