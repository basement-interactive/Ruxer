// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/app/components/dialogs/components/ComparisonCheckRow.module.css';
import {Trans} from '@lingui/react/macro';
import {CheckIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';

export const ComparisonCheckRow = observer(
	({feature, restrictedHas, stockHas}: {feature: string; restrictedHas: boolean; stockHas: boolean}) => (
		<div className={styles.row} data-flx="app.comparison-check-row.row">
			<div className={styles.feature} data-flx="app.comparison-check-row.feature">
				<p className={styles.featureText} data-flx="app.comparison-check-row.feature-text">
					{feature}
				</p>
			</div>
			<div className={styles.valuesContainer} data-flx="app.comparison-check-row.values-container">
				<div className={styles.valueCell} data-flx="app.comparison-check-row.value-cell">
					{restrictedHas ? (
						<CheckIcon className={styles.checkIcon} weight="bold" data-flx="app.comparison-check-row.check-icon" />
					) : (
						<span className={styles.dash} data-flx="app.comparison-check-row.dash">
							<Trans>No</Trans>
						</span>
					)}
				</div>
				<div className={styles.valueCell} data-flx="app.comparison-check-row.value-cell--2">
					{stockHas ? (
						<CheckIcon className={styles.checkIcon} weight="bold" data-flx="app.comparison-check-row.check-icon--2" />
					) : (
						<span className={styles.dash} data-flx="app.comparison-check-row.dash--2">
							<Trans>No</Trans>
						</span>
					)}
				</div>
			</div>
		</div>
	),
);
