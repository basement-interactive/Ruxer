// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/auth/flow/AuthPageStyles.module.css';
import {Spinner} from '@app/features/ui/components/Spinner';
import type {JSX} from 'react';

export function AuthLoadingState(): JSX.Element {
	return (
		<div className={styles.loadingContainer} data-flx="auth.flow.auth-loading-state.loading-container">
			<Spinner data-flx="auth.flow.auth-loading-state.spinner" />
		</div>
	);
}
