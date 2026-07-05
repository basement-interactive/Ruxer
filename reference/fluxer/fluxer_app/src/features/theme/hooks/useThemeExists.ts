// SPDX-License-Identifier: AGPL-3.0-or-later

import RuntimeConfig from '@app/features/app/state/RuntimeConfig';
import {buildMediaProxyURL} from '@app/features/messaging/utils/MediaProxyUtils';
import {Logger} from '@app/features/platform/utils/AppLogger';
import {useEffect, useState} from 'react';

const logger = new Logger('useThemeExists');

export type ThemeExistsStatus = 'loading' | 'ready' | 'error';

const buildThemeUrl = (endpoint: string, themeId: string): string => {
	const base = endpoint.replace(/\/$/, '');
	return `${base}/themes/${themeId}.css`;
};
export const useThemeExists = (themeId: string | null | undefined): ThemeExistsStatus => {
	const [status, setStatus] = useState<ThemeExistsStatus>('loading');
	const mediaEndpoint = RuntimeConfig.mediaEndpoint;
	useEffect(() => {
		if (!mediaEndpoint || !themeId) {
			setStatus('loading');
			return;
		}
		let cancelled = false;
		const checkThemeExists = async () => {
			try {
				const response = await fetch(buildMediaProxyURL(buildThemeUrl(mediaEndpoint, themeId)), {method: 'HEAD'});
				if (!response.ok) throw new Error('Theme not found');
				if (cancelled) return;
				setStatus('ready');
			} catch (error) {
				if (cancelled) return;
				logger.error('Failed to check theme', error);
				setStatus('error');
			}
		};
		setStatus('loading');
		void checkThemeExists();
		return () => {
			cancelled = true;
		};
	}, [mediaEndpoint, themeId]);
	return status;
};
