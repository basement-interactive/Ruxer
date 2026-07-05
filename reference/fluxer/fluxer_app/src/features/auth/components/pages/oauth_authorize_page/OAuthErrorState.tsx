// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/auth/components/pages/OAuthAuthorizePage.module.css';
import {msg} from '@lingui/core/macro';
import {Trans, useLingui} from '@lingui/react/macro';
import type React from 'react';

const INVALID_AUTHORIZATION_REQUEST_DESCRIPTOR = msg({
	message: 'Invalid authorization request',
	comment: 'Short label in the authentication OAUTH error state. Keep the tone plain and specific.',
});

interface OAuthErrorStateProps {
	error: string | null;
	validationError: string | null;
}

export const OAuthErrorState: React.FC<OAuthErrorStateProps> = ({error, validationError}) => {
	const {i18n} = useLingui();
	return (
		<div className={styles.errorContainer} data-flx="auth.o-auth-authorize-page.error-container">
			<div className={styles.errorContent} data-flx="auth.o-auth-authorize-page.error-content">
				<h1 className={styles.errorTitle} data-flx="auth.o-auth-authorize-page.error-title">
					<Trans>Authorization failed</Trans>
				</h1>
				<p className={styles.errorText} data-flx="auth.o-auth-authorize-page.error-text">
					{error ?? validationError ?? i18n._(INVALID_AUTHORIZATION_REQUEST_DESCRIPTOR)}
				</p>
			</div>
		</div>
	);
};
