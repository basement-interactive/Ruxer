// SPDX-License-Identifier: AGPL-3.0-or-later

import {Logger} from '@app/features/platform/utils/AppLogger';
import ReadStates from '@app/features/read_state/state/ReadStates';
import {hasUnavailableElectronNativeContext, isDesktop} from '@app/features/ui/utils/NativeUtils';
import {useEffect} from 'react';

const logger = new Logger('useServiceWorkerBadge');

export function useServiceWorkerBadge(): void {
	useEffect(() => {
		if (isDesktop() || hasUnavailableElectronNativeContext() || !('serviceWorker' in navigator)) {
			return;
		}
		const postBadgeUpdate = (count: number) => {
			const controller = navigator.serviceWorker.controller;
			if (!controller) {
				return;
			}
			try {
				controller.postMessage({type: 'APP_UPDATE_BADGE', count});
			} catch (error) {
				logger.warn('Failed to post badge update to service worker', error);
			}
		};
		const updateBadgeFromReadState = () => {
			const channelIds = ReadStates.getChannelIds();
			const totalMentions = channelIds.reduce((sum, channelId) => sum + ReadStates.getMentionCount(channelId), 0);
			postBadgeUpdate(totalMentions);
		};
		const unsubscribe = ReadStates.subscribe(() => {
			updateBadgeFromReadState();
		});
		return () => {
			unsubscribe();
		};
	}, []);
}
