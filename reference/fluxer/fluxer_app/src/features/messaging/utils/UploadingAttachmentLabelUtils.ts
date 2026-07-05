// SPDX-License-Identifier: AGPL-3.0-or-later

import type {I18n} from '@lingui/core';
import {msg} from '@lingui/core/macro';

const UPLOADING_OTHER_DESCRIPTOR = msg({
	message: 'Uploading {count, plural, one {# file} other {# files}}',
	comment:
		'Filename-like progress label for a temporary message attachment while multiple selected files are uploading.',
});

export function formatUploadingAttachmentSummary(i18n: I18n, count: number): string {
	return i18n._(UPLOADING_OTHER_DESCRIPTOR, {count});
}
