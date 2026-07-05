// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/auth/components/pages/OAuthAuthorizePage.module.css';
import {Spinner} from '@app/features/ui/components/Spinner';
import type React from 'react';

export const OAuthLoadingState: React.FC = () => {
	return (
		<div className={styles.loadingContainer} data-flx="auth.o-auth-authorize-page.loading-container">
			<Spinner data-flx="auth.o-auth-authorize-page.spinner" />
		</div>
	);
};
