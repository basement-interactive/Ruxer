// SPDX-License-Identifier: AGPL-3.0-or-later

export const DONATION_CURRENCIES = ['usd', 'eur', 'brl', 'inr', 'pln', 'try'] as const;

export type DonationCurrency = (typeof DONATION_CURRENCIES)[number];

interface DonationAmountConstraints {
	displayCurrency: 'USD' | 'EUR' | 'BRL' | 'INR' | 'PLN' | 'TRY';
	minimumAmountMinor: number;
	maximumAmountMinor: number;
	presetAmountsMajor: readonly [number, number, number, number, number];
	defaultPresetIndex: 0 | 1 | 2 | 3 | 4;
}

const DONATION_AMOUNT_CONSTRAINTS: Readonly<Record<DonationCurrency, DonationAmountConstraints>> = {
	usd: {
		displayCurrency: 'USD',
		minimumAmountMinor: 500,
		maximumAmountMinor: 100000,
		presetAmountsMajor: [5, 25, 50, 100, 500],
		defaultPresetIndex: 1,
	},
	eur: {
		displayCurrency: 'EUR',
		minimumAmountMinor: 500,
		maximumAmountMinor: 100000,
		presetAmountsMajor: [5, 25, 50, 100, 500],
		defaultPresetIndex: 1,
	},
	brl: {
		displayCurrency: 'BRL',
		minimumAmountMinor: 2500,
		maximumAmountMinor: 500000,
		presetAmountsMajor: [25, 50, 100, 250, 500],
		defaultPresetIndex: 1,
	},
	inr: {
		displayCurrency: 'INR',
		minimumAmountMinor: 50000,
		maximumAmountMinor: 10000000,
		presetAmountsMajor: [500, 1000, 2500, 5000, 10000],
		defaultPresetIndex: 1,
	},
	pln: {
		displayCurrency: 'PLN',
		minimumAmountMinor: 2000,
		maximumAmountMinor: 400000,
		presetAmountsMajor: [20, 50, 100, 250, 500],
		defaultPresetIndex: 1,
	},
	try: {
		displayCurrency: 'TRY',
		minimumAmountMinor: 25000,
		maximumAmountMinor: 5000000,
		presetAmountsMajor: [250, 500, 1000, 2500, 5000],
		defaultPresetIndex: 1,
	},
};

export function getDonationAmountConstraints(currency: DonationCurrency): DonationAmountConstraints {
	return DONATION_AMOUNT_CONSTRAINTS[currency];
}

export function isDonationAmountWithinConstraints(amountMinor: number, currency: DonationCurrency): boolean {
	const constraints = getDonationAmountConstraints(currency);
	return amountMinor >= constraints.minimumAmountMinor && amountMinor <= constraints.maximumAmountMinor;
}
