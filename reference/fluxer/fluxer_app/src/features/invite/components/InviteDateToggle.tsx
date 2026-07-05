// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/invite/components/InviteDateToggle.module.css';
import {Checkbox} from '@app/features/ui/checkbox/Checkbox';
import {Trans} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback} from 'react';

interface InviteDateToggleProps {
	showCreatedDate: boolean;
	onToggle: (showCreatedDate: boolean) => void;
}

export const InviteDateToggle: React.FC<InviteDateToggleProps> = observer(({showCreatedDate, onToggle}) => {
	const handleChange = useCallback(
		(isChecked: boolean) => {
			onToggle(isChecked);
		},
		[onToggle],
	);
	return (
		<div className={styles.container} data-flx="invite.invite-date-toggle.container">
			<Checkbox
				checked={showCreatedDate}
				onChange={handleChange}
				size="small"
				data-flx="invite.invite-date-toggle.checkbox.change"
			>
				<span className={styles.label} data-flx="invite.invite-date-toggle.label">
					<Trans>Show creation date instead of expiration date</Trans>
				</span>
			</Checkbox>
		</div>
	);
});
