// SPDX-License-Identifier: AGPL-3.0-or-later

declare const LanguageCodeBrand: unique symbol;

export type LanguageCode = string & {
	readonly __brand: typeof LanguageCodeBrand;
};
export type BadgeValue = number | -1;

export interface MediaDimensions {
	maxWidth: number;
	maxHeight: number;
}

export type ResponseInterceptor = (
	response: {
		ok: boolean;
		status: number;
		headers: Record<string, string>;
		body: unknown;
		text?: string;
	},
	retryWithHeaders: (
		headers: Record<string, string>,
		overrideInterceptor?: ResponseInterceptor,
	) => Promise<{
		ok: boolean;
		status: number;
		headers: Record<string, string>;
		body: unknown;
		text?: string;
	}>,
	reject: (error: Error) => void,
) =>
	| boolean
	| Promise<{
			ok: boolean;
			status: number;
			headers: Record<string, string>;
			body: unknown;
			text?: string;
	  }>
	| undefined;
