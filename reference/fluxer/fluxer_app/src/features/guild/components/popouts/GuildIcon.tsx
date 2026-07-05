// SPDX-License-Identifier: AGPL-3.0-or-later

import Accessibility from '@app/features/accessibility/state/Accessibility';
import {useHover} from '@app/features/app/hooks/useHover';
import styles from '@app/features/guild/components/popouts/GuildIcon.module.css';
import {getGuildIconDisplayInitials, getInitialsLength} from '@app/features/guild/utils/GuildInitialsUtils';
import * as ImageCacheUtils from '@app/features/messaging/utils/ImageCacheUtils';
import {remFromPx} from '@app/features/theme/layout/RemFromPx';
import * as AvatarUtils from '@app/features/user/utils/AvatarUtils';
import * as StringUtils from '@app/lib/strings';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useEffect, useMemo, useState} from 'react';

interface GuildIconProps {
	id: string;
	name: string;
	icon: string | null;
	className?: string;
	sizePx?: number;
	containerProps?: React.HTMLAttributes<HTMLElement> & {
		'data-flx'?: string;
		'data-jump-link-guild-icon'?: string;
	};
}

type GuildIconStyleVars = React.CSSProperties & {
	'--guild-icon-size'?: string;
	'--guild-icon-image'?: string;
};

export const GuildIcon = observer(function GuildIcon({
	id,
	name,
	icon,
	className,
	sizePx,
	containerProps,
}: GuildIconProps) {
	const rawInitials = useMemo(() => StringUtils.getInitialsFromName(name), [name]);
	const initials = useMemo(() => getGuildIconDisplayInitials(rawInitials), [rawInitials]);
	const initialsLength = useMemo(() => getInitialsLength(rawInitials), [rawInitials]);
	const [hoverRef, isHovering] = useHover();
	const iconUrl = useMemo(() => (icon ? AvatarUtils.getGuildIconURL({id, icon}) : null), [id, icon]);
	const hoverIconUrl = useMemo(() => (icon ? AvatarUtils.getGuildIconURL({id, icon}, true) : null), [id, icon]);
	const [isStaticLoaded, setIsStaticLoaded] = useState(() => (iconUrl ? ImageCacheUtils.hasImage(iconUrl) : false));
	const [isAnimatedLoaded, setIsAnimatedLoaded] = useState(() =>
		hoverIconUrl ? ImageCacheUtils.hasImage(hoverIconUrl) : false,
	);
	const [shouldPlayAnimated, setShouldPlayAnimated] = useState(false);
	useEffect(() => {
		setIsStaticLoaded(iconUrl ? ImageCacheUtils.hasImage(iconUrl) : false);
		setIsAnimatedLoaded(hoverIconUrl ? ImageCacheUtils.hasImage(hoverIconUrl) : false);
		setShouldPlayAnimated(false);
	}, [iconUrl, hoverIconUrl]);
	useEffect(() => {
		if (!iconUrl || isStaticLoaded) return;
		let cancelled = false;
		ImageCacheUtils.loadImage(iconUrl, () => {
			if (!cancelled) setIsStaticLoaded(true);
		});
		return () => {
			cancelled = true;
		};
	}, [iconUrl, isStaticLoaded]);
	useEffect(() => {
		if (!isHovering || !hoverIconUrl || isAnimatedLoaded) return;
		let cancelled = false;
		ImageCacheUtils.loadImage(hoverIconUrl, () => {
			if (!cancelled) setIsAnimatedLoaded(true);
		});
		return () => {
			cancelled = true;
		};
	}, [isHovering, hoverIconUrl, isAnimatedLoaded]);
	useEffect(() => {
		setShouldPlayAnimated(Boolean(isHovering && isAnimatedLoaded));
	}, [isHovering, isAnimatedLoaded]);
	const activeUrl = shouldPlayAnimated && hoverIconUrl ? hoverIconUrl : iconUrl;
	const styleVars: GuildIconStyleVars = {};
	if (sizePx != null) {
		styleVars['--guild-icon-size'] = remFromPx(sizePx);
	}
	if (isStaticLoaded && activeUrl) {
		styleVars['--guild-icon-image'] = `url(${activeUrl})`;
	}
	const reducedMotion = Accessibility.useReducedMotion;
	return (
		<div
			ref={hoverRef}
			className={clsx(styles.container, className, !icon && styles.containerNoIcon)}
			data-flx="guild.guild-icon.container"
			{...containerProps}
			data-initials-length={initialsLength}
			data-reduced-motion={reducedMotion}
			style={styleVars}
		>
			{!icon && (
				<span className={styles.initials} data-flx="guild.guild-icon.initials">
					{initials}
				</span>
			)}
		</div>
	);
});
