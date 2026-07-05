// SPDX-License-Identifier: AGPL-3.0-or-later

import {Routes} from '@app/app/Routes';
import styles from '@app/features/app/components/layout/GuildNavbar.module.css';
import {useLocation} from '@app/features/platform/components/router/RouterReact';
import MobileLayout from '@app/features/ui/state/MobileLayout';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import type React from 'react';

interface GuildSidebarProps {
	header: React.ReactNode;
	content: React.ReactNode;
	roundTopLeft?: boolean;
}

export const GuildSidebar = observer(({header, content, roundTopLeft = true}: GuildSidebarProps) => {
	const mobileLayout = MobileLayout;
	const location = useLocation();
	const showBottomNav =
		mobileLayout.enabled &&
		(location.pathname === Routes.ME ||
			location.pathname === Routes.FAVORITES ||
			Routes.isDiscoverRoute(location.pathname) ||
			location.pathname === Routes.NOTIFICATIONS ||
			location.pathname === Routes.YOU ||
			(Routes.isGuildChannelRoute(location.pathname) && location.pathname.split('/').length === 3));
	return (
		<div
			className={clsx(
				styles.guildNavbarContainer,
				mobileLayout.enabled && styles.guildNavbarContainerMobile,
				showBottomNav && styles.guildNavbarReserveMobileBottomNav,
			)}
			style={roundTopLeft ? undefined : {borderTopLeftRadius: 0}}
			data-flx="app.guild-sidebar.guild-navbar"
		>
			{header}
			{content}
		</div>
	);
});
