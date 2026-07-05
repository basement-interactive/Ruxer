// SPDX-License-Identifier: AGPL-3.0-or-later

export type NumberInput = number | string | null | undefined;

export interface NumberFormatBaseOptions {
	locale?: string;
	fallbackValue?: number;
}

export interface NumberFormatOptions extends NumberFormatBaseOptions {
	numberFormatOptions?: Intl.NumberFormatOptions;
}

export interface CompactNumberFormatOptions extends NumberFormatBaseOptions {
	maximumFractionDigits?: number;
	minimumFractionDigits?: number;
}

export interface CurrencyNumberFormatOptions extends NumberFormatBaseOptions {
	currency: string;
	numberFormatOptions?: Omit<Intl.NumberFormatOptions, 'style' | 'currency'>;
}

export interface NumberFormatterFactoryOptions extends NumberFormatBaseOptions {}

export interface BoundCompactNumberFormatOptions {
	maximumFractionDigits?: number;
	minimumFractionDigits?: number;
}

export interface BoundCurrencyNumberFormatOptions {
	currency: string;
	numberFormatOptions?: Omit<Intl.NumberFormatOptions, 'style' | 'currency'>;
}

export interface INumberFormatter {
	parse(value: NumberInput): number;
	format(value: NumberInput, numberFormatOptions?: Intl.NumberFormatOptions): string;
	formatCompact(value: NumberInput, options?: BoundCompactNumberFormatOptions): string;
	formatCurrency(value: NumberInput, options: BoundCurrencyNumberFormatOptions): string;
}
