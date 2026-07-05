// SPDX-License-Identifier: AGPL-3.0-or-later

import {MS_PER_DAY} from '@fluxer/date_utils/src/DateConstants';
import {parseDate} from '@fluxer/date_utils/src/DateParsing';
import type {DateInput} from '@fluxer/date_utils/src/DateTypes';

export function isSameDay(date1: DateInput, date2?: DateInput): boolean {
	const d1 = parseDate(date1);
	const d2 = date2 != null ? parseDate(date2) : new Date();
	return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
}

export function getDaysBetween(date1: DateInput, date2: DateInput): number {
	const d1 = parseDate(date1);
	const d2 = parseDate(date2);
	const d1Start = new Date(d1.getFullYear(), d1.getMonth(), d1.getDate());
	const d2Start = new Date(d2.getFullYear(), d2.getMonth(), d2.getDate());
	return Math.round((d1Start.getTime() - d2Start.getTime()) / MS_PER_DAY);
}
