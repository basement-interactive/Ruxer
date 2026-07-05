// SPDX-License-Identifier: AGPL-3.0-or-later

import CompactVoiceCallHeight from '@app/features/voice/state/CompactVoiceCallHeight';
import {useCallback} from 'react';

interface CompactCallExpansionOptions {
	storageKey: string | null;
	defaultExpanded: boolean;
	persistByDefault?: boolean;
}

interface SetCompactCallExpansionOptions {
	persist?: boolean;
}

export function useCompactCallExpansionState({
	storageKey,
	defaultExpanded,
	persistByDefault = true,
}: CompactCallExpansionOptions) {
	const isExpanded = storageKey
		? CompactVoiceCallHeight.getExpandedForKey(storageKey, defaultExpanded)
		: defaultExpanded;
	const setExpanded = useCallback(
		(nextExpanded: boolean, options: SetCompactCallExpansionOptions = {}) => {
			if (!storageKey) return;
			CompactVoiceCallHeight.setExpandedForKey(storageKey, nextExpanded, {
				persist: options.persist ?? persistByDefault,
			});
		},
		[persistByDefault, storageKey],
	);
	const toggleExpanded = useCallback(() => {
		if (!storageKey) return;
		const current = CompactVoiceCallHeight.getExpandedForKey(storageKey, defaultExpanded);
		CompactVoiceCallHeight.setExpandedForKey(storageKey, !current, {persist: persistByDefault});
	}, [defaultExpanded, persistByDefault, storageKey]);
	return {
		isExpanded,
		setExpanded,
		toggleExpanded,
	};
}
