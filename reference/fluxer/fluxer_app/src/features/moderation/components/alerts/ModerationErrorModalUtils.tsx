// SPDX-License-Identifier: AGPL-3.0-or-later

import {showGenericErrorModal} from '@app/features/app/components/alerts/GenericErrorModalCommands';
import {SOMETHING_WENT_WRONG_DESCRIPTOR} from '@app/features/i18n/utils/CommonMessageDescriptors';
import type {I18n} from '@lingui/core';
import type {ReactNode} from 'react';

export function showModerationErrorModal(
	i18n: I18n,
	message: ReactNode | (() => ReactNode),
	dataFlx: string,
	defer = false,
): void {
	showGenericErrorModal({
		title: () => i18n._(SOMETHING_WENT_WRONG_DESCRIPTOR),
		message,
		dataFlx,
		defer,
	});
}
