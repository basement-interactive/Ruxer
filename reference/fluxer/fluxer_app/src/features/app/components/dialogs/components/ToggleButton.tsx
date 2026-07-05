// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/app/components/dialogs/components/ToggleButton.module.css';
import FocusRing from '@app/features/ui/focus_ring/FocusRing';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import type React from 'react';

export const ToggleButton: React.FC<{active: boolean; onClick: () => void; label: React.ReactNode}> = observer(
	({active, onClick, label}) => (
		<FocusRing offset={-2} data-flx="app.toggle-button.focus-ring">
			<button
				type="button"
				aria-pressed={active}
				className={clsx(styles.button, active ? styles.active : styles.inactive)}
				onClick={onClick}
				data-flx="app.toggle-button.button.click"
			>
				{label}
			</button>
		</FocusRing>
	),
);
