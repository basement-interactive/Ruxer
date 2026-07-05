// SPDX-License-Identifier: AGPL-3.0-or-later

import {clampWideAssetAspectRatio} from '@app/features/expressions/utils/AssetImageGeometry';
import styles from '@app/features/messaging/components/embeds/embed_card/EmbedCard.module.css';
import {clsx} from 'clsx';
import type React from 'react';

interface EmbedCardProps {
	splashURL?: string | null;
	splashAspectRatio?: number;
	icon: React.ReactNode;
	title: React.ReactNode;
	subtitle?: React.ReactNode;
	body?: React.ReactNode;
	footer: React.ReactNode;
	className?: string;
	headerClassName?: string;
}

export const EmbedCard = ({
	splashURL,
	splashAspectRatio,
	icon,
	title,
	subtitle,
	body,
	footer,
	className,
	headerClassName,
}: EmbedCardProps) => {
	const clampedSplashAspectRatio = clampWideAssetAspectRatio(splashAspectRatio);
	const hasSplashAspectRatio = clampedSplashAspectRatio != null;
	const hasSplash = splashURL != null && splashURL !== '';
	return (
		<div className={clsx(styles.wrapper, className)} data-flx="messaging.embeds.embed-card.embed-card.wrapper">
			{hasSplash ? (
				<div className={styles.splashWrapper} data-flx="messaging.embeds.embed-card.embed-card.splash-wrapper">
					<div
						className={styles.splash}
						style={
							{
								'--embed-splash-url': `url(${splashURL})`,
								...(hasSplashAspectRatio ? {height: 'auto', aspectRatio: clampedSplashAspectRatio} : {}),
							} as React.CSSProperties
						}
						data-flx="messaging.embeds.embed-card.embed-card.splash"
					/>
				</div>
			) : null}
			<div className={styles.grid} data-flx="messaging.embeds.embed-card.embed-card.grid">
				<div className={styles.iconSlot} data-flx="messaging.embeds.embed-card.embed-card.icon-slot">
					{icon}
				</div>
				<div className={styles.content} data-flx="messaging.embeds.embed-card.embed-card.content">
					<div
						className={clsx(styles.header, headerClassName)}
						data-flx="messaging.embeds.embed-card.embed-card.header"
					>
						<div className={styles.titleRow} data-flx="messaging.embeds.embed-card.embed-card.title-row">
							{title}
						</div>
						{subtitle ? (
							<div className={styles.subtitle} data-flx="messaging.embeds.embed-card.embed-card.subtitle">
								{subtitle}
							</div>
						) : null}
					</div>
					{body ? (
						<div className={styles.body} data-flx="messaging.embeds.embed-card.embed-card.body">
							{body}
						</div>
					) : null}
				</div>
			</div>
			<div className={styles.divider} data-flx="messaging.embeds.embed-card.embed-card.divider">
				{footer}
			</div>
		</div>
	);
};

interface SkeletonProps {
	className?: string;
	style?: React.CSSProperties;
}

const Skeleton = ({className, style}: SkeletonProps) => (
	<div
		className={clsx(styles.skeleton, className)}
		style={style}
		data-flx="messaging.embeds.embed-card.embed-card.skeleton.skeleton"
	/>
);
export const EmbedSkeletonCircle = ({className}: SkeletonProps) => (
	<Skeleton
		className={clsx(styles.skeletonCircle, className)}
		data-flx="messaging.embeds.embed-card.embed-card.embed-skeleton-circle.skeleton-circle"
	/>
);
export const EmbedSkeletonTitle = ({className}: SkeletonProps) => (
	<Skeleton
		className={clsx(styles.skeletonTitle, className)}
		data-flx="messaging.embeds.embed-card.embed-card.embed-skeleton-title.skeleton-title"
	/>
);
export const EmbedSkeletonSubtitle = ({className}: SkeletonProps) => (
	<Skeleton
		className={clsx(styles.skeletonSubtitle, className)}
		data-flx="messaging.embeds.embed-card.embed-card.embed-skeleton-subtitle.skeleton-subtitle"
	/>
);
export const EmbedSkeletonIcon = ({className}: SkeletonProps) => (
	<Skeleton
		className={clsx(styles.skeletonIcon, className)}
		data-flx="messaging.embeds.embed-card.embed-card.embed-skeleton-icon.skeleton-icon"
	/>
);
export const EmbedSkeletonDot = ({className}: SkeletonProps) => (
	<Skeleton
		className={clsx(styles.skeletonDot, className)}
		data-flx="messaging.embeds.embed-card.embed-card.embed-skeleton-dot.skeleton-dot"
	/>
);
export const EmbedSkeletonStatShort = ({className}: SkeletonProps) => (
	<Skeleton
		className={clsx(styles.skeletonStat, styles.skeletonStatShort, className)}
		data-flx="messaging.embeds.embed-card.embed-card.embed-skeleton-stat-short.skeleton-stat"
	/>
);
export const EmbedSkeletonStatLong = ({className}: SkeletonProps) => (
	<Skeleton
		className={clsx(styles.skeletonStat, styles.skeletonStatLong, className)}
		data-flx="messaging.embeds.embed-card.embed-card.embed-skeleton-stat-long.skeleton-stat"
	/>
);
export const EmbedSkeletonButton = ({className}: SkeletonProps) => (
	<Skeleton
		className={clsx(styles.skeletonButton, className)}
		data-flx="messaging.embeds.embed-card.embed-card.embed-skeleton-button.skeleton-button"
	/>
);
