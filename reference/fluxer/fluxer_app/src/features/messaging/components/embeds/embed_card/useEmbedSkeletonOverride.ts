// SPDX-License-Identifier: AGPL-3.0-or-later

import DeveloperOptions from '@app/features/devtools/state/DeveloperOptions';
import {useMemo} from 'react';

export function useEmbedSkeletonOverride(): boolean {
	return useMemo(() => {
		if (!DeveloperOptions.forceEmbedSkeletons) return false;
		return Math.random() < 0.5;
	}, [DeveloperOptions.forceEmbedSkeletons]);
}
