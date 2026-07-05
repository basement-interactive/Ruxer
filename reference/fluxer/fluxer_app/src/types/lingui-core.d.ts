// SPDX-License-Identifier: AGPL-3.0-or-later

import type {MessageDescriptor, MessageOptions} from '@lingui/core';

declare module '@lingui/core' {
	interface I18n {
		_(descriptor: MessageDescriptor, values?: Record<string, unknown>, options?: MessageOptions): string;
	}
}
