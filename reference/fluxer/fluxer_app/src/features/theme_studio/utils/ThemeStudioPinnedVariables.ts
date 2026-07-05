// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	THEME_STUDIO_DARK_DEFAULT_VARIABLE_VALUES,
	THEME_STUDIO_LIGHT_DEFAULT_VARIABLE_VALUES,
	THEME_VARIABLE_NAMES,
} from '@app/features/theme/variables/ThemeVariableManifest';
import {ThemeTypes} from '@fluxer/constants/src/UserConstants';

export type ThemeStudioBaseTheme = 'dark' | 'light';

export function getThemeStudioBaseTheme(effectiveTheme: string): ThemeStudioBaseTheme {
	return effectiveTheme === ThemeTypes.LIGHT ? 'light' : 'dark';
}

export function getThemeStudioFallbackDefaultVariables(
	baseTheme: ThemeStudioBaseTheme,
): Readonly<Record<string, string>> {
	return baseTheme === 'light' ? THEME_STUDIO_LIGHT_DEFAULT_VARIABLE_VALUES : THEME_STUDIO_DARK_DEFAULT_VARIABLE_VALUES;
}

export function readThemeStudioComputedDefaultVariables(
	fallbackVariables: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
	if (typeof window === 'undefined') return fallbackVariables;
	const computedStyle = window.getComputedStyle(document.documentElement);
	const values: Record<string, string> = {...fallbackVariables};
	for (const name of THEME_VARIABLE_NAMES) {
		const value = computedStyle.getPropertyValue(name).trim();
		if (value.length > 0) {
			values[name] = value;
		}
	}
	return values;
}

export function pinThemeStudioDefaultVariables(
	element: HTMLElement | null,
	variables: Readonly<Record<string, string>>,
): () => void {
	if (!element) return () => {};
	for (const [name, value] of Object.entries(variables)) {
		element.style.setProperty(name, value, 'important');
	}
	return () => {
		for (const name of Object.keys(variables)) {
			element.style.removeProperty(name);
		}
	};
}
