// SPDX-License-Identifier: AGPL-3.0-or-later

import Sudo from '@app/features/auth/state/AuthSudo';
import SudoPrompt from '@app/features/auth/state/SudoPrompt';
import type {SudoVerificationPayload} from '@app/features/auth/types/AuthSudoTypes';
import {useCallback} from 'react';

export function useSudo() {
	const require = useCallback(async (): Promise<SudoVerificationPayload> => {
		if (Sudo.hasValidToken()) {
			return {};
		}
		return await SudoPrompt.requestVerification();
	}, []);
	const finalize = useCallback(() => {
		SudoPrompt.handleTokenReceived(null);
	}, []);
	return {require, finalize};
}
