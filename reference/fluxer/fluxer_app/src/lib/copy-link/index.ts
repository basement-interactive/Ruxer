// SPDX-License-Identifier: AGPL-3.0-or-later

import * as TextCopyCommands from '@app/features/ui/commands/TextCopyCommands';
import {useLingui} from '@lingui/react/macro';
import {useCallback} from 'react';

export function useCopyLinkHandler(text: string | null, suppressToast = true): () => Promise<boolean> {
	const {i18n} = useLingui();
	return useCallback(async () => {
		if (!text) return false;
		return TextCopyCommands.copy(i18n, text, suppressToast);
	}, [i18n, suppressToast, text]);
}
