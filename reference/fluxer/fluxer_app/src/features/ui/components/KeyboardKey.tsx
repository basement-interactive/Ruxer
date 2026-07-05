// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/ui/components/KeyboardKey.module.css';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';

export interface KeyboardKeyProps {
	children: React.ReactNode;
}

export const KeyboardKey: React.FC<KeyboardKeyProps> = observer(({children}) => (
	<kbd className={clsx(styles.key, children === '↵' && styles.keyWide)} data-flx="ui.keyboard-key.key">
		{children}
	</kbd>
));
