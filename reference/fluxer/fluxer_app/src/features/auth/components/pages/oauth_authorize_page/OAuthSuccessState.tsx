// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/auth/components/pages/OAuthAuthorizePage.module.css';
import {Button} from '@app/features/ui/button/Button';
import {Trans} from '@lingui/react/macro';
import {CheckCircleIcon} from '@phosphor-icons/react';
import type React from 'react';

interface OAuthSuccessStateProps {
	destinationName?: string | null;
	onDone?: () => void;
}

export const OAuthSuccessState: React.FC<OAuthSuccessStateProps> = ({destinationName, onDone}) => {
	return (
		<div className={styles.page} data-flx="auth.o-auth-authorize-page.page">
			<div className={styles.successScreen} data-flx="auth.o-auth-authorize-page.success-screen">
				<div className={styles.successIconCircle} data-flx="auth.o-auth-authorize-page.success-icon-circle">
					<CheckCircleIcon
						weight="fill"
						className={styles.successIcon}
						data-flx="auth.o-auth-authorize-page.success-icon"
					/>
				</div>
				<h1 className={styles.successTitle} data-flx="auth.o-auth-authorize-page.success-title">
					<Trans>Bot added</Trans>
				</h1>
				<p className={styles.successSubtitle} data-flx="auth.o-auth-authorize-page.success-subtitle">
					{destinationName ? (
						<Trans>
							The bot has been added to <strong data-flx="auth.o-auth-authorize-page.strong">{destinationName}</strong>.
						</Trans>
					) : (
						<Trans>The bot has been added.</Trans>
					)}
				</p>
				{onDone ? (
					<Button
						type="button"
						onClick={onDone}
						className={styles.successAction}
						data-flx="auth.o-auth-authorize-page.success-button.done"
					>
						<Trans>Done</Trans>
					</Button>
				) : null}
			</div>
		</div>
	);
};
