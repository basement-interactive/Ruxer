// SPDX-License-Identifier: AGPL-3.0-or-later

import * as Modal from '@app/features/app/components/dialogs/Modal';
import type {OAuth2Authorization} from '@app/features/auth/commands/OAuth2AuthorizationCommands';
import {AuthorizedAppsContent} from '@app/features/user/components/modals/tabs/AuthorizedAppsTab';
import {Trans} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';

interface AuthorizedAppsManagementModalProps {
	authorizations: Array<OAuth2Authorization>;
	'data-flx'?: string;
}

export const AuthorizedAppsManagementModal = observer(({authorizations}: AuthorizedAppsManagementModalProps) => (
	<Modal.Root size="medium" centered data-flx="user.account-management-modals.authorized-apps.modal-root">
		<Modal.Header
			title={<Trans>Authorized apps</Trans>}
			data-flx="user.account-management-modals.authorized-apps.header"
		/>
		<AuthorizedAppsContent
			presentation="modal"
			initialAuthorizations={authorizations}
			data-flx="user.account-management-modals.authorized-apps.authorized-apps-content"
		/>
	</Modal.Root>
));
