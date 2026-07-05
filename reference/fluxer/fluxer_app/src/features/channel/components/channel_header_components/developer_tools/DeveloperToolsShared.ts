// SPDX-License-Identifier: AGPL-3.0-or-later

import type {I18n, MessageDescriptor} from '@lingui/core';
import {msg} from '@lingui/core/macro';

export type LocalizedLabel = string | MessageDescriptor;

export interface ActiveOverrideEntry {
	key: string;
	label: string;
	value: string;
	reset: () => void;
}

export type RadioMenuOption<T> = {
	value: T;
	label: LocalizedLabel;
	key?: React.Key;
};

export const ENABLED_DESCRIPTOR = msg({
	message: 'Enabled',
	comment: 'Developer tools debug menu label. Internal-only surface for developers; translators may keep this terse.',
});
export const FORCED_OFF_DESCRIPTOR = msg({
	message: 'Forced off',
	comment: 'Developer tools debug menu label. Internal-only surface for developers; translators may keep this terse.',
});
export const CUSTOM_VALUE_DESCRIPTOR = msg({
	message: 'Custom value',
	comment: 'Developer tools debug menu label. Internal-only surface for developers; translators may keep this terse.',
});
export const USE_ACTUAL_VALUE_DESCRIPTOR = msg({
	message: 'Use actual value',
	comment: 'Developer tools debug menu label. Internal-only surface for developers; translators may keep this terse.',
});
export const ACTIVE_DESCRIPTOR = msg({
	message: 'Active',
	comment: 'Developer tools debug menu label. Internal-only surface for developers; translators may keep this terse.',
});
export const NONE_DESCRIPTOR = msg({
	message: 'None',
	comment: 'Developer tools debug menu label. Internal-only surface for developers; translators may keep this terse.',
});
export const USE_DEFAULT_DESCRIPTOR = msg({
	message: 'Use default',
	comment: 'Developer tools debug menu label. Internal-only surface for developers; translators may keep this terse.',
});
export const translateDescriptor = (i18n: I18n, descriptor: LocalizedLabel): string =>
	typeof descriptor === 'string' ? descriptor : i18n._(descriptor);
export const nonEmptyText = (value: string, fallback: string): string => {
	if (value.trim().length > 0) return value;
	if (fallback.trim().length > 0) return fallback;
	return '';
};
export const humanizeDeveloperStateKey = (key: string): string => {
	return key
		.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.replace(/\bNsfw\b/g, 'Mature')
		.replace(/\bUk\b/g, 'UK')
		.replace(/\bUrl\b/g, 'URL')
		.replace(/\bId\b/g, 'ID')
		.replace(/^./, (char) => char.toUpperCase());
};
