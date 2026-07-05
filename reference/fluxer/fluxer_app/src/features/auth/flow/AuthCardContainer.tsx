// SPDX-License-Identifier: AGPL-3.0-or-later

import authLayoutStyles from '@app/features/app/components/layout/AuthLayout.module.css';
import styles from '@app/features/auth/flow/AuthCardContainer.module.css';
import type {AuthCardVariant} from '@app/features/auth/state/AuthLayoutContext';
import {FluxerLogo} from '@app/features/ui/components/icons/FluxerLogo';
import {FluxerWordmark} from '@app/features/ui/components/icons/FluxerWordmark';
import clsx from 'clsx';
import type {ReactNode} from 'react';

interface AuthCardContainerProps {
	showLogoSide?: boolean;
	variant?: AuthCardVariant;
	children: ReactNode;
	isInert?: boolean;
	className?: string;
}

const cardVariantClassNames: Record<AuthCardVariant, string | undefined> = {
	default: undefined,
	standard: authLayoutStyles.cardStandard,
	compact: authLayoutStyles.cardCompact,
	wide: authLayoutStyles.cardWide,
};
const formSideVariantClassNames: Record<AuthCardVariant, string | undefined> = {
	default: undefined,
	standard: authLayoutStyles.formSideStandard,
	compact: authLayoutStyles.formSideCompact,
	wide: authLayoutStyles.formSideWide,
};

export function AuthCardContainer({
	showLogoSide = true,
	variant = 'default',
	children,
	isInert = false,
	className,
}: AuthCardContainerProps) {
	return (
		<div className={clsx(authLayoutStyles.cardContainer, className)} data-flx="auth.flow.auth-card-container.div">
			<div
				className={clsx(
					authLayoutStyles.card,
					!showLogoSide && authLayoutStyles.cardSingle,
					cardVariantClassNames[variant],
				)}
				data-flx="auth.flow.auth-card-container.div--2"
			>
				{showLogoSide && (
					<div className={authLayoutStyles.logoSide} data-flx="auth.flow.auth-card-container.div--3">
						<FluxerLogo className={authLayoutStyles.logo} data-flx="auth.flow.auth-card-container.fluxer-logo" />
						<FluxerWordmark
							className={authLayoutStyles.wordmark}
							data-flx="auth.flow.auth-card-container.fluxer-wordmark"
						/>
					</div>
				)}
				<div
					className={clsx(
						authLayoutStyles.formSide,
						!showLogoSide && authLayoutStyles.formSideSingle,
						formSideVariantClassNames[variant],
					)}
					data-flx="auth.flow.auth-card-container.div--4"
				>
					{isInert ? (
						<div className={styles.inertOverlay} data-flx="auth.flow.auth-card-container.inert-overlay">
							{children}
						</div>
					) : (
						children
					)}
				</div>
			</div>
		</div>
	);
}
