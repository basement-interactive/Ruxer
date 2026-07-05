// SPDX-License-Identifier: AGPL-3.0-or-later

import {GenericErrorModal} from '@app/features/app/components/alerts/GenericErrorModal';
import {msg} from '@lingui/core/macro';
import {Trans, useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type {ReactElement} from 'react';

const FAILED_TO_REMOVE_FROM_GROUP_DESCRIPTOR = msg({
	message: "Couldn't remove from group",
	comment: 'Error modal title shown when removing a user from a group DM fails.',
});

interface GroupRemoveUserFailedModalProps {
	username: string;
}

export const GroupRemoveUserFailedModal = observer(({username}: GroupRemoveUserFailedModalProps) => {
	const {i18n} = useLingui();
	const message: ReactElement = (
		<Trans>
			<strong data-flx="app.group-remove-user-failed-modal.strong">{username}</strong> is still in the group. Try again
			in a moment.
		</Trans>
	);
	return (
		<GenericErrorModal
			title={i18n._(FAILED_TO_REMOVE_FROM_GROUP_DESCRIPTOR)}
			message={message}
			data-flx="app.group-remove-user-failed-modal.generic-error-modal"
		/>
	);
});
