// SPDX-License-Identifier: AGPL-3.0-or-later

import * as fs from 'node:fs';
import * as path from 'node:path';

export function localeFilePath(locale: string, localesPath: string): string {
	return path.join(localesPath, `${locale}.yaml`);
}

export function hasLocaleFile(locale: string, localesPath: string, defaultLocale: string): boolean {
	if (locale === defaultLocale) {
		return true;
	}
	return fs.existsSync(localeFilePath(locale, localesPath));
}
