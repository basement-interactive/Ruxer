// SPDX-License-Identifier: AGPL-3.0-or-later

import {OutageSplashScreen} from '@app/features/app/components/layout/SplashScreen';
import {useEffect} from 'react';

const AUTO_RELOAD_BASE_MS = 15_000;
const AUTO_RELOAD_JITTER_MS = 5_000;

export function NetworkErrorScreen() {
	useEffect(() => {
		const delay = AUTO_RELOAD_BASE_MS + Math.random() * AUTO_RELOAD_JITTER_MS;
		const timer = setTimeout(() => {
			window.location.reload();
		}, delay);
		return () => clearTimeout(timer);
	}, []);
	return <OutageSplashScreen data-flx="app.network-error-screen.outage-splash-screen" />;
}
