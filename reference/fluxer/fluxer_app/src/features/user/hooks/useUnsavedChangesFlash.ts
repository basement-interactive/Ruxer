// SPDX-License-Identifier: AGPL-3.0-or-later

import * as UnsavedChangesCommands from '@app/features/ui/commands/UnsavedChangesCommands';
import UnsavedChanges from '@app/features/ui/state/UnsavedChanges';
import {useCallback, useEffect, useState} from 'react';

export function useUnsavedChangesFlash(selectedTab?: string) {
	const unsavedChangesState = UnsavedChanges;
	const [flashBanner, setFlashBanner] = useState(false);
	const [lastFlashTrigger, setLastFlashTrigger] = useState(0);
	const currentTabId = selectedTab || '';
	const showUnsavedBanner = unsavedChangesState.unsavedChanges[currentTabId] || false;
	const flashTrigger = unsavedChangesState.flashTriggers[currentTabId] || 0;
	const tabData = unsavedChangesState.tabData[currentTabId] || {};
	useEffect(() => {
		if (flashTrigger > lastFlashTrigger) {
			setFlashBanner(true);
			setLastFlashTrigger(flashTrigger);
			setTimeout(() => setFlashBanner(false), 300);
		}
	}, [flashTrigger, lastFlashTrigger]);
	const checkUnsavedChanges = useCallback(
		(tabId?: string): boolean => {
			const checkTabId = tabId || selectedTab;
			if (!checkTabId) return false;
			if (unsavedChangesState.unsavedChanges[checkTabId]) {
				UnsavedChangesCommands.triggerFlashEffect(checkTabId);
				return true;
			}
			return false;
		},
		[selectedTab, unsavedChangesState.unsavedChanges],
	);
	return {
		showUnsavedBanner,
		flashBanner,
		tabData,
		checkUnsavedChanges,
	};
}
