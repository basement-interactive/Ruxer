// SPDX-License-Identifier: AGPL-3.0-or-later

import {Endpoints} from '@app/features/app/constants/Endpoints';
import {http} from '@app/features/platform/transport/RestTransport';
import {Logger} from '@app/features/platform/utils/AppLogger';
import {useCallback, useEffect, useState} from 'react';

const logger = new Logger('PushSubscriptions');

export interface PushSubscriptionInfo {
	subscription_id: string;
	user_agent: string | null;
}

export const usePushSubscriptions = (enabled: boolean) => {
	const [subscriptions, setSubscriptions] = useState<Array<PushSubscriptionInfo>>([]);
	const [loading, setLoading] = useState(false);
	const fetchSubscriptions = useCallback(async () => {
		if (!enabled) {
			setSubscriptions([]);
			return;
		}
		setLoading(true);
		try {
			const response = await http.get<{
				subscriptions: Array<PushSubscriptionInfo>;
			}>(Endpoints.USER_PUSH_SUBSCRIPTIONS);
			setSubscriptions(response.body.subscriptions ?? []);
		} catch (error) {
			logger.error('Failed to load push subscriptions', {error});
			setSubscriptions([]);
		} finally {
			setLoading(false);
		}
	}, [enabled]);
	useEffect(() => {
		void fetchSubscriptions();
	}, [fetchSubscriptions]);
	return {
		subscriptions,
		loading,
		refresh: fetchSubscriptions,
	};
};
