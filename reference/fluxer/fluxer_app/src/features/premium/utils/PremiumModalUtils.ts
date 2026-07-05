// SPDX-License-Identifier: AGPL-3.0-or-later

import {useMemo} from 'react';

export interface PremiumModalProps {
	defaultGiftMode?: boolean;
}

export interface PremiumModalLogicState {
	defaultGiftMode: boolean;
}

export function usePremiumModalLogic({defaultGiftMode = false}: PremiumModalProps): PremiumModalLogicState {
	return useMemo(
		() => ({
			defaultGiftMode,
		}),
		[defaultGiftMode],
	);
}
