// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/app/components/layout/GuildNavbarSkeleton.module.css';
import MobileLayout from '@app/features/ui/state/MobileLayout';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';

export const GuildNavbarSkeleton = observer(() => {
	const mobileLayout = MobileLayout;
	return (
		<div
			className={clsx(styles.skeletonContainer, mobileLayout.enabled && styles.skeletonContainerMobile)}
			data-flx="app.guild-navbar-skeleton.skeleton-container"
		>
			<div className={styles.skeletonHeader} data-flx="app.guild-navbar-skeleton.skeleton-header">
				<div className={styles.skeletonHeaderPill} data-flx="app.guild-navbar-skeleton.skeleton-header-pill" />
			</div>
			<div className={styles.skeletonContent} data-flx="app.guild-navbar-skeleton.skeleton-content">
				<div className={styles.skeletonCategory} data-flx="app.guild-navbar-skeleton.skeleton-category">
					<div className={styles.skeletonCategoryPill} data-flx="app.guild-navbar-skeleton.skeleton-category-pill" />
				</div>
				<div className={styles.skeletonChannel} data-flx="app.guild-navbar-skeleton.skeleton-channel">
					<div className={styles.skeletonChannelPill} data-flx="app.guild-navbar-skeleton.skeleton-channel-pill" />
				</div>
				<div className={styles.skeletonChannel} data-flx="app.guild-navbar-skeleton.skeleton-channel--2">
					<div className={styles.skeletonChannelPill} data-flx="app.guild-navbar-skeleton.skeleton-channel-pill--2" />
				</div>
				<div className={styles.skeletonChannel} data-flx="app.guild-navbar-skeleton.skeleton-channel--3">
					<div className={styles.skeletonChannelPill} data-flx="app.guild-navbar-skeleton.skeleton-channel-pill--3" />
				</div>
				<div className={styles.skeletonCategory} data-flx="app.guild-navbar-skeleton.skeleton-category--2">
					<div className={styles.skeletonCategoryPill} data-flx="app.guild-navbar-skeleton.skeleton-category-pill--2" />
				</div>
				<div className={styles.skeletonChannel} data-flx="app.guild-navbar-skeleton.skeleton-channel--4">
					<div className={styles.skeletonChannelPill} data-flx="app.guild-navbar-skeleton.skeleton-channel-pill--4" />
				</div>
				<div className={styles.skeletonChannel} data-flx="app.guild-navbar-skeleton.skeleton-channel--5">
					<div className={styles.skeletonChannelPill} data-flx="app.guild-navbar-skeleton.skeleton-channel-pill--5" />
				</div>
				<div className={styles.skeletonCategory} data-flx="app.guild-navbar-skeleton.skeleton-category--3">
					<div className={styles.skeletonCategoryPill} data-flx="app.guild-navbar-skeleton.skeleton-category-pill--3" />
				</div>
				<div className={styles.skeletonChannel} data-flx="app.guild-navbar-skeleton.skeleton-channel--6">
					<div className={styles.skeletonChannelPill} data-flx="app.guild-navbar-skeleton.skeleton-channel-pill--6" />
				</div>
				<div className={styles.skeletonChannel} data-flx="app.guild-navbar-skeleton.skeleton-channel--7">
					<div className={styles.skeletonChannelPill} data-flx="app.guild-navbar-skeleton.skeleton-channel-pill--7" />
				</div>
				<div className={styles.skeletonChannel} data-flx="app.guild-navbar-skeleton.skeleton-channel--8">
					<div className={styles.skeletonChannelPill} data-flx="app.guild-navbar-skeleton.skeleton-channel-pill--8" />
				</div>
				<div className={styles.skeletonChannel} data-flx="app.guild-navbar-skeleton.skeleton-channel--9">
					<div className={styles.skeletonChannelPill} data-flx="app.guild-navbar-skeleton.skeleton-channel-pill--9" />
				</div>
			</div>
		</div>
	);
});
