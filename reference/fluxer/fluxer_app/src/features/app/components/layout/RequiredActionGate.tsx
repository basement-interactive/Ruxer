// SPDX-License-Identifier: AGPL-3.0-or-later

import {resolveRequiredActionFlow} from '@app/features/auth/components/modals/RequiredActionFlow';
import RequiredActionModal from '@app/features/auth/components/modals/RequiredActionModal';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import LayerManager from '@app/features/ui/state/LayerManager';
import Modal from '@app/features/ui/state/Modal';
import Users from '@app/features/user/state/Users';
import {observer} from 'mobx-react-lite';
import {useEffect} from 'react';

export const REQUIRED_ACTION_MODAL_KEY = 'required-actions';
const RequiredActionGate = observer(() => {
	const requiredActionKey = resolveRequiredActionFlow(Users.currentUser?.requiredActions)?.key ?? null;
	const isModalOpen = Modal.hasModal(REQUIRED_ACTION_MODAL_KEY);
	useEffect(() => {
		if (!requiredActionKey) {
			if (isModalOpen) {
				ModalCommands.popWithKey(REQUIRED_ACTION_MODAL_KEY);
			}
			return;
		}
		if (!isModalOpen) {
			LayerManager.closeAll();
		}
		ModalCommands.pushWithKey(
			ModalCommands.modal(() => (
				<RequiredActionModal mock={false} data-flx="app.required-action-gate.required-action-modal" />
			)),
			REQUIRED_ACTION_MODAL_KEY,
		);
	}, [isModalOpen, requiredActionKey]);
	useEffect(
		() => () => {
			ModalCommands.popWithKey(REQUIRED_ACTION_MODAL_KEY);
		},
		[],
	);
	return null;
});

export default RequiredActionGate;
