// SPDX-License-Identifier: AGPL-3.0-or-later

import {GenericErrorModal} from '@app/features/app/components/alerts/GenericErrorModal';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';

const FAILED_TO_REVOKE_INVITE_DESCRIPTOR = msg({
	message: "Couldn't revoke invite",
	comment: 'Error modal title shown when revoking an invite fails.',
});
const WE_COULDN_T_REVOKE_THE_INVITE_THE_LINK_DESCRIPTOR = msg({
	message: 'The link may still work. Try again in a moment.',
	comment: 'Error modal body shown when revoking an invite fails; warns the user that the link may still be live.',
});
export const InviteRevokeFailedModal = observer(() => {
	const {i18n} = useLingui();
	return (
		<GenericErrorModal
			title={i18n._(FAILED_TO_REVOKE_INVITE_DESCRIPTOR)}
			message={i18n._(WE_COULDN_T_REVOKE_THE_INVITE_THE_LINK_DESCRIPTOR)}
			data-flx="invite.invite-revoke-failed-modal.generic-error-modal"
		/>
	);
});
