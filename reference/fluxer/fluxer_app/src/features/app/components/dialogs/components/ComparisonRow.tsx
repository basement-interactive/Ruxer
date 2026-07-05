// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/app/components/dialogs/components/ComparisonRow.module.css';
import {observer} from 'mobx-react-lite';
import type React from 'react';

export const ComparisonRow = observer(
	({
		feature,
		restrictedValue,
		stockValue,
	}: {
		feature: string;
		restrictedValue: React.ReactNode;
		stockValue: React.ReactNode;
	}) => (
		<div className={styles.row} data-flx="app.comparison-row.row">
			<div className={styles.feature} data-flx="app.comparison-row.feature">
				<p className={styles.featureText} data-flx="app.comparison-row.feature-text">
					{feature}
				</p>
			</div>
			<div className={styles.valuesContainer} data-flx="app.comparison-row.values-container">
				<div className={styles.restrictedValue} data-flx="app.comparison-row.restricted-value">
					{restrictedValue}
				</div>
				<div className={styles.stockValue} data-flx="app.comparison-row.stock-value">
					{stockValue}
				</div>
			</div>
		</div>
	),
);
