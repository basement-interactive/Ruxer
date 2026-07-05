// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	MINUTES_DURATION_PLURAL_DESCRIPTOR,
	SECONDS_DURATION_PLURAL_DESCRIPTOR,
} from '@app/features/i18n/utils/CommonMessageDescriptors';
import type {I18n} from '@lingui/core';
import {msg} from '@lingui/core/macro';

export const NO_TIMER_DESCRIPTOR = msg({
	message: 'No timer',
	comment: 'Developer tools debug menu label. Internal-only surface for developers; translators may keep this terse.',
});
export const formatDurationMs = (i18n: I18n, value: number): string => {
	if (value <= 0) return i18n._(NO_TIMER_DESCRIPTOR);
	const seconds = Math.round(value / 1000);
	if (seconds < 60) return i18n._(SECONDS_DURATION_PLURAL_DESCRIPTOR, {seconds});
	const minutes = Math.round(seconds / 60);
	return i18n._(MINUTES_DURATION_PLURAL_DESCRIPTOR, {minutes});
};
