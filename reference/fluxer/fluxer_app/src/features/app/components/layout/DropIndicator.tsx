// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/app/components/layout/DropIndicator.module.css';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';

export const DropIndicator = observer(({position, isValid}: {position: 'top' | 'bottom'; isValid: boolean}) => (
	<div
		className={clsx(
			styles.dropIndicator,
			position === 'top' ? styles.dropIndicatorTop : styles.dropIndicatorBottom,
			isValid ? styles.dropIndicatorValid : styles.dropIndicatorInvalid,
		)}
		data-flx="app.drop-indicator.drop-indicator"
	/>
));
