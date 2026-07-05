// SPDX-License-Identifier: AGPL-3.0-or-later

export const MAX_GIFT_CODES_PER_REQUEST = 100;
export const MAX_GIFT_DURATION_QUANTITY = 3650;

const GiftCodeDurationTypes = {
	DAYS: 'days',
	WEEKS: 'weeks',
	MONTHS: 'months',
	YEARS: 'years',
} as const;

export const GIFT_CODE_DURATION_TYPE_DEFINITIONS = [
	[GiftCodeDurationTypes.DAYS, 'days', 'Gift duration in days'],
	[GiftCodeDurationTypes.WEEKS, 'weeks', 'Gift duration in weeks'],
	[GiftCodeDurationTypes.MONTHS, 'months', 'Gift duration in months'],
	[GiftCodeDurationTypes.YEARS, 'years', 'Gift duration in years'],
] as const;
