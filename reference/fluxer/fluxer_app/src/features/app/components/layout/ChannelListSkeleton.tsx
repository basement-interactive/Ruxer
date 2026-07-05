// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/app/components/layout/GuildNavbarSkeleton.module.css';
import type React from 'react';

export const ChannelListSkeleton: React.FC = () => {
	return (
		<div className={styles.skeletonContent} data-flx="app.channel-list-skeleton.skeleton-content">
			<div className={styles.skeletonCategory} data-flx="app.channel-list-skeleton.skeleton-category">
				<div className={styles.skeletonCategoryPill} data-flx="app.channel-list-skeleton.skeleton-category-pill" />
			</div>
			<div className={styles.skeletonChannel} data-flx="app.channel-list-skeleton.skeleton-channel">
				<div className={styles.skeletonChannelPill} data-flx="app.channel-list-skeleton.skeleton-channel-pill" />
			</div>
			<div className={styles.skeletonChannel} data-flx="app.channel-list-skeleton.skeleton-channel--2">
				<div className={styles.skeletonChannelPill} data-flx="app.channel-list-skeleton.skeleton-channel-pill--2" />
			</div>
			<div className={styles.skeletonChannel} data-flx="app.channel-list-skeleton.skeleton-channel--3">
				<div className={styles.skeletonChannelPill} data-flx="app.channel-list-skeleton.skeleton-channel-pill--3" />
			</div>
			<div className={styles.skeletonCategory} data-flx="app.channel-list-skeleton.skeleton-category--2">
				<div className={styles.skeletonCategoryPill} data-flx="app.channel-list-skeleton.skeleton-category-pill--2" />
			</div>
			<div className={styles.skeletonChannel} data-flx="app.channel-list-skeleton.skeleton-channel--4">
				<div className={styles.skeletonChannelPill} data-flx="app.channel-list-skeleton.skeleton-channel-pill--4" />
			</div>
			<div className={styles.skeletonChannel} data-flx="app.channel-list-skeleton.skeleton-channel--5">
				<div className={styles.skeletonChannelPill} data-flx="app.channel-list-skeleton.skeleton-channel-pill--5" />
			</div>
			<div className={styles.skeletonCategory} data-flx="app.channel-list-skeleton.skeleton-category--3">
				<div className={styles.skeletonCategoryPill} data-flx="app.channel-list-skeleton.skeleton-category-pill--3" />
			</div>
			<div className={styles.skeletonChannel} data-flx="app.channel-list-skeleton.skeleton-channel--6">
				<div className={styles.skeletonChannelPill} data-flx="app.channel-list-skeleton.skeleton-channel-pill--6" />
			</div>
			<div className={styles.skeletonChannel} data-flx="app.channel-list-skeleton.skeleton-channel--7">
				<div className={styles.skeletonChannelPill} data-flx="app.channel-list-skeleton.skeleton-channel-pill--7" />
			</div>
			<div className={styles.skeletonChannel} data-flx="app.channel-list-skeleton.skeleton-channel--8">
				<div className={styles.skeletonChannelPill} data-flx="app.channel-list-skeleton.skeleton-channel-pill--8" />
			</div>
			<div className={styles.skeletonChannel} data-flx="app.channel-list-skeleton.skeleton-channel--9">
				<div className={styles.skeletonChannelPill} data-flx="app.channel-list-skeleton.skeleton-channel-pill--9" />
			</div>
		</div>
	);
};
