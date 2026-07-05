// SPDX-License-Identifier: AGPL-3.0-or-later

import {GenericErrorModal} from '@app/features/app/components/alerts/GenericErrorModal';
import {msg} from '@lingui/core/macro';
import {Trans, useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type {ReactElement} from 'react';

const FAILED_TO_TRANSFER_OWNERSHIP_DESCRIPTOR = msg({
	message: 'Failed to transfer ownership',
	comment: 'Error message in the group ownership transfer failed modal.',
});

interface GroupOwnershipTransferFailedModalProps {
	username: string;
}

export const GroupOwnershipTransferFailedModal = observer(({username}: GroupOwnershipTransferFailedModalProps) => {
	const {i18n} = useLingui();
	const message: ReactElement = (
		<Trans>
			Ownership could not be transferred to{' '}
			<strong data-flx="guild.group-ownership-transfer-failed-modal.strong">{username}</strong> at this time.
		</Trans>
	);
	return (
		<GenericErrorModal
			title={i18n._(FAILED_TO_TRANSFER_OWNERSHIP_DESCRIPTOR)}
			message={message}
			data-flx="guild.group-ownership-transfer-failed-modal.generic-error-modal"
		/>
	);
});
