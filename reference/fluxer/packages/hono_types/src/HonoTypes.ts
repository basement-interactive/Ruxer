// SPDX-License-Identifier: AGPL-3.0-or-later

export interface ErrorI18nService {
	getMessage(
		key: string,
		locale: string | null | undefined,
		variables?: Record<string, unknown>,
		fallbackMessage?: string,
	): string;
}

export interface BaseHonoEnv {
	Variables: {
		errorI18nService?: ErrorI18nService;
		requestLocale?: string;
		requestId?: string;
	};
}
