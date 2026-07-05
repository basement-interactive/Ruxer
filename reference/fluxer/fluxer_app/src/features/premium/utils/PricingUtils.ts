// SPDX-License-Identifier: AGPL-3.0-or-later

import {getCachedNumberFormat} from '@app/features/i18n/utils/IntlCache';
import {isEuEeaCountryCode} from '@fluxer/constants/src/EuropeanEconomicArea';

export enum PricingTier {
	Monthly = 'monthly',
	Yearly = 'yearly',
}

export enum Currency {
	USD = 'USD',
	EUR = 'EUR',
	BRL = 'BRL',
	INR = 'INR',
	PLN = 'PLN',
	TRY = 'TRY',
}

export type PricingMode = 'localized' | 'base';

const PRICE: Record<PricingTier, Record<Currency, number>> = {
	[PricingTier.Monthly]: {
		[Currency.USD]: 4.99,
		[Currency.EUR]: 4.99,
		[Currency.BRL]: 24.99,
		[Currency.INR]: 499,
		[Currency.PLN]: 17.99,
		[Currency.TRY]: 229.99,
	},
	[PricingTier.Yearly]: {
		[Currency.USD]: 49.99,
		[Currency.EUR]: 49.99,
		[Currency.BRL]: 249.99,
		[Currency.INR]: 4999,
		[Currency.PLN]: 179.99,
		[Currency.TRY]: 2299.99,
	},
};

function getCurrency(countryCode: string | null): Currency {
	if (!countryCode) return Currency.USD;
	const upperCountryCode = countryCode.toUpperCase();
	if (upperCountryCode === 'BR') return Currency.BRL;
	if (upperCountryCode === 'IN') return Currency.INR;
	if (upperCountryCode === 'PL') return Currency.PLN;
	if (upperCountryCode === 'TR') return Currency.TRY;
	return isEuEeaCountryCode(countryCode) ? Currency.EUR : Currency.USD;
}

export function isEEACountry(countryCode: string | null | undefined): boolean {
	return isEuEeaCountryCode(countryCode);
}

export function hasLocalizedPricingChoice(countryCode: string | null | undefined): boolean {
	if (!countryCode) return false;
	const upperCountryCode = countryCode.toUpperCase();
	return (
		upperCountryCode === 'BR' || upperCountryCode === 'IN' || upperCountryCode === 'PL' || upperCountryCode === 'TR'
	);
}

export function getBaseCurrency(countryCode: string | null | undefined): Currency {
	if (!countryCode) return Currency.USD;
	return isEEACountry(countryCode) ? Currency.EUR : Currency.USD;
}

export function isLocalizedCurrency(currency: string | null | undefined): boolean {
	return (
		currency === Currency.BRL || currency === Currency.INR || currency === Currency.PLN || currency === Currency.TRY
	);
}

export function getCurrencyCodeLabel(currency: string | null | undefined): string {
	switch (currency) {
		case Currency.BRL:
			return 'BRL';
		case Currency.INR:
			return 'INR';
		case Currency.PLN:
			return 'PLN';
		case Currency.TRY:
			return 'TRY';
		case Currency.EUR:
			return 'EUR';
		default:
			return 'USD';
	}
}

function getPrice(tier: PricingTier, currency: Currency): number {
	return PRICE[tier][currency];
}

function formatPrice(price: number, currency: Currency): string {
	const currencySymbols: Record<Currency, string> = {
		[Currency.USD]: '$',
		[Currency.EUR]: '€',
		[Currency.BRL]: 'R$',
		[Currency.INR]: '₹',
		[Currency.PLN]: 'zł',
		[Currency.TRY]: '₺',
	};
	return `${currencySymbols[currency]}${price.toFixed(2).replace(/\.00$/, '')}`;
}

export function getFormattedPrice(tier: PricingTier, countryCode: string | null): string {
	const currency = getCurrency(countryCode);
	const price = getPrice(tier, currency);
	return formatPrice(price, currency);
}

export function formatMinorUnitPrice(
	amountMinor: number | null | undefined,
	currency: string | null | undefined,
	locale: string,
): string | null {
	if (amountMinor == null || !currency) {
		return null;
	}
	const fractionDigits =
		getCachedNumberFormat(locale, {
			style: 'currency',
			currency,
		}).resolvedOptions().maximumFractionDigits ?? 2;
	return getCachedNumberFormat(locale, {
		style: 'currency',
		currency,
		minimumFractionDigits: 0,
		maximumFractionDigits: fractionDigits,
	}).format(amountMinor / 10 ** fractionDigits);
}
