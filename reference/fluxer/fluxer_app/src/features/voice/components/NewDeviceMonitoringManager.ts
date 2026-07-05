// SPDX-License-Identifier: AGPL-3.0-or-later

import {useLayoutVariant} from '@app/features/app/state/LayoutVariantContext';
import Authentication from '@app/features/auth/state/Authentication';
import NewDeviceMonitoring from '@app/features/auth/state/NewDeviceMonitoring';
import {observer} from 'mobx-react-lite';
import {useEffect} from 'react';

export const NewDeviceMonitoringManager: React.FC = observer(() => {
	const isAuthenticated = Authentication.isAuthenticated;
	const variant = useLayoutVariant();
	const shouldRun = isAuthenticated && variant === 'app';
	useEffect(() => {
		if (!shouldRun) {
			return;
		}
		void NewDeviceMonitoring.start();
		return () => {
			NewDeviceMonitoring.dispose();
		};
	}, [shouldRun]);
	return null;
});
