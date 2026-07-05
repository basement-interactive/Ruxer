// SPDX-License-Identifier: AGPL-3.0-or-later

import {PortalHostContext} from '@app/features/ui/overlay/PortalHostContext';
import Modal from '@app/features/ui/state/Modal';
import {ModalStackContext} from '@app/features/ui/utils/ModalStackContext';
import {LinguiContext} from '@lingui/react';
import {AnimatePresence} from 'framer-motion';
import {observer} from 'mobx-react-lite';
import {useContext} from 'react';

interface ModalStackProps {
	ownerDocument?: Document;
}

export const ModalStack = observer(({ownerDocument = document}: ModalStackProps) => {
	useContext(LinguiContext);
	const orderedModals = Modal.getOrderedModals(ownerDocument);
	return (
		<AnimatePresence data-flx="app.modal-stack.animate-presence">
			{orderedModals.map(
				({key, modal, stackIndex, isVisible, needsBackdrop, isTopmost, restoreFocusOnClose, portalHost}) => (
					<ModalStackContext.Provider
						key={key}
						value={{stackIndex, isVisible, needsBackdrop, isTopmost, restoreFocusOnClose}}
					>
						<PortalHostContext.Provider value={portalHost}>{modal()}</PortalHostContext.Provider>
					</ModalStackContext.Provider>
				),
			)}
		</AnimatePresence>
	);
});
