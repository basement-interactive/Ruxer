// SPDX-License-Identifier: AGPL-3.0-or-later

import {getElectronAPI, isDesktop} from '@app/features/ui/utils/NativeUtils';
import {useEffect} from 'react';

export function useStopFlashFrameOnFocus(): void {
	useEffect(() => {
		if (!isDesktop()) return;
		const electronApi = getElectronAPI();
		if (!electronApi || typeof electronApi.stopFlashFrame !== 'function') return;
		const onFocus = () => {
			try {
				electronApi.stopFlashFrame?.();
			} catch {}
		};
		window.addEventListener('focus', onFocus);
		return () => window.removeEventListener('focus', onFocus);
	}, []);
}
