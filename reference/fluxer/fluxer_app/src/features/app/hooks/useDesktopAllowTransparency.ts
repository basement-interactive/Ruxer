// SPDX-License-Identifier: AGPL-3.0-or-later

import {useDocumentClassToggle} from '@app/features/app/hooks/useDocumentClassToggle';
import {
	getCachedDesktopWindowBehaviorSettings,
	getDesktopWindowBehaviorSettings,
} from '@app/features/ui/utils/DesktopWindowBehaviorUtils';
import type {DesktopWindowBehaviorSettings} from '@app/types/electron.d';
import {useEffect, useState} from 'react';

function resolveActiveAllowTransparency(settings: DesktopWindowBehaviorSettings | null): boolean {
	return settings?.activeAllowTransparency ?? settings?.allowTransparency ?? false;
}

export function useDesktopAllowTransparency(isNative: boolean): void {
	const [allowTransparency, setAllowTransparency] = useState(() =>
		document.documentElement.classList.contains('allow-transparency'),
	);
	useEffect(() => {
		if (!isNative) {
			setAllowTransparency(false);
			return;
		}
		const cached = getCachedDesktopWindowBehaviorSettings();
		if (cached) {
			setAllowTransparency(resolveActiveAllowTransparency(cached));
		}
		void getDesktopWindowBehaviorSettings().then((settings) => {
			setAllowTransparency(resolveActiveAllowTransparency(settings));
		});
	}, [isNative]);
	useDocumentClassToggle('allow-transparency', allowTransparency);
}
