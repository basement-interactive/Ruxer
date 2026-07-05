// SPDX-License-Identifier: AGPL-3.0-or-later

import {DiscoveryGuildHeader} from '@app/features/app/components/layout/DiscoveryGuildHeader';
import styles from '@app/features/app/components/layout/GuildLayout.module.css';
import {GuildSidebar} from '@app/features/app/components/layout/GuildSidebar';
import {DiscoveryPage} from '@app/features/discovery/discovery/DiscoveryPage';
import {DiscoverySidebar} from '@app/features/discovery/discovery/DiscoverySidebar';
import Discovery from '@app/features/discovery/state/Discovery';
import MobileLayout from '@app/features/ui/state/MobileLayout';
import {observer} from 'mobx-react-lite';
import {useEffect} from 'react';

export const DiscoveryLayout = observer(function DiscoveryLayout() {
	const mobileLayout = MobileLayout;
	useEffect(() => {
		void Discovery.loadCategories();
		void Discovery.search({offset: 0});
		return () => {
			Discovery.reset();
		};
	}, []);
	if (mobileLayout.enabled) {
		return <DiscoveryPage data-flx="app.discovery-layout.discovery-page.mobile" />;
	}
	return (
		<div className={styles.guildLayoutContainer} data-flx="app.discovery-layout.guild-layout-container">
			<div className={styles.guildLayoutContent} data-flx="app.discovery-layout.guild-layout-content">
				<GuildSidebar
					header={<DiscoveryGuildHeader data-flx="app.discovery-layout.discovery-guild-header" />}
					content={<DiscoverySidebar data-flx="app.discovery-layout.discovery-sidebar" />}
					data-flx="app.discovery-layout.guild-sidebar"
				/>
				<div className={styles.guildMainContent} data-flx="app.discovery-layout.guild-main-content">
					<DiscoveryPage data-flx="app.discovery-layout.discovery-page" />
				</div>
			</div>
		</div>
	);
});
