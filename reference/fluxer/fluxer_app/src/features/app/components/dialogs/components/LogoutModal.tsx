// SPDX-License-Identifier: AGPL-3.0-or-later

import {ConfirmModal} from '@app/features/app/components/dialogs/ConfirmModal';
import * as AuthenticationCommands from '@app/features/auth/commands/AuthenticationCommands';
import {msg} from '@lingui/core/macro';
import {Trans, useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';

const SIGN_OUT_DESCRIPTOR = msg({
	message: 'Sign out?',
	comment: 'Question prompt in the settings dialog logout modal. Keep the tone plain and specific.',
});
const SIGN_OUT_2_DESCRIPTOR = msg({
	message: 'Sign out',
	comment: 'Short label in the settings dialog logout modal. Keep the tone plain and specific.',
});
const STAY_SIGNED_IN_DESCRIPTOR = msg({
	message: 'Stay signed in',
	comment: 'Short label in the settings dialog logout modal.',
});
export const LogoutModal = observer(() => {
	const {i18n} = useLingui();
	return (
		<ConfirmModal
			title={i18n._(SIGN_OUT_DESCRIPTOR)}
			description={<Trans>You can sign back in at any time.</Trans>}
			primaryText={i18n._(SIGN_OUT_2_DESCRIPTOR)}
			secondaryText={i18n._(STAY_SIGNED_IN_DESCRIPTOR)}
			onPrimary={() => AuthenticationCommands.logout()}
			data-flx="app.logout-modal.confirm-modal"
		/>
	);
});
