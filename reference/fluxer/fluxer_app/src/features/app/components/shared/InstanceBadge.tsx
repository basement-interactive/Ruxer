// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/app/components/shared/InstanceBadge.module.css';
import {Tooltip} from '@app/features/ui/tooltip/Tooltip';
import {GlobeIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import {useCallback, useEffect, useMemo, useState} from 'react';

interface InstanceBadgeProps {
	instanceDomain: string;
	size?: 'small' | 'medium';
	showTooltip?: boolean;
	className?: string;
}

type FaviconLoadState = 'loading' | 'loaded' | 'error';

const faviconCache = new Map<string, {state: FaviconLoadState; url: string | null}>();

function getFaviconUrl(instanceDomain: string): string {
	return `https://${instanceDomain}/favicon.ico`;
}

export const InstanceBadge = observer(function InstanceBadge({
	instanceDomain,
	size = 'small',
	showTooltip = true,
	className,
}: InstanceBadgeProps) {
	const [faviconState, setFaviconState] = useState<FaviconLoadState>(() => {
		const cached = faviconCache.get(instanceDomain);
		return cached?.state ?? 'loading';
	});
	const faviconUrl = useMemo(() => getFaviconUrl(instanceDomain), [instanceDomain]);
	const handleImageLoad = useCallback(() => {
		faviconCache.set(instanceDomain, {state: 'loaded', url: faviconUrl});
		setFaviconState('loaded');
	}, [instanceDomain, faviconUrl]);
	const handleImageError = useCallback(() => {
		faviconCache.set(instanceDomain, {state: 'error', url: null});
		setFaviconState('error');
	}, [instanceDomain]);
	useEffect(() => {
		const cached = faviconCache.get(instanceDomain);
		if (cached) {
			setFaviconState(cached.state);
			return;
		}
		const img = new Image();
		img.onload = handleImageLoad;
		img.onerror = handleImageError;
		img.src = faviconUrl;
		return () => {
			img.onload = null;
			img.onerror = null;
		};
	}, [instanceDomain, faviconUrl, handleImageLoad, handleImageError]);
	const iconSize = size === 'small' ? 12 : 18;
	const badgeContent = useMemo(() => {
		const containerClass = clsx(styles.badge, size === 'small' ? styles.small : styles.medium, className);
		if (faviconState === 'loaded') {
			return (
				<span className={containerClass} data-flx="app.instance-badge.badge-content.span">
					<img
						src={faviconUrl}
						alt=""
						className={styles.favicon}
						aria-hidden="true"
						data-flx="app.instance-badge.badge-content.favicon"
					/>
				</span>
			);
		}
		return (
			<span className={containerClass} data-flx="app.instance-badge.badge-content.span--2">
				<GlobeIcon
					size={iconSize}
					weight="regular"
					className={styles.globeIcon}
					aria-hidden="true"
					data-flx="app.instance-badge.badge-content.globe-icon"
				/>
			</span>
		);
	}, [faviconState, faviconUrl, size, iconSize, className]);
	if (!showTooltip) {
		return badgeContent;
	}
	return (
		<Tooltip text={instanceDomain} position="top" data-flx="app.instance-badge.tooltip">
			{badgeContent}
		</Tooltip>
	);
});
