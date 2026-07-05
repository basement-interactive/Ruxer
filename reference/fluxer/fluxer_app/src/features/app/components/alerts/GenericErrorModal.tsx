// SPDX-License-Identifier: AGPL-3.0-or-later

import {ConfirmModal} from '@app/features/app/components/dialogs/ConfirmModal';
import {UNDERSTOOD_DESCRIPTOR} from '@app/features/i18n/utils/CommonMessageDescriptors';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';

interface GenericErrorModalProps {
	title: string;
	message: React.ReactNode;
	'data-flx'?: string;
}

export const GenericErrorModal: React.FC<GenericErrorModalProps> = observer(({title, message, 'data-flx': dataFlx}) => {
	const {i18n} = useLingui();
	return (
		<ConfirmModal
			title={title}
			description={message}
			primaryText={i18n._(UNDERSTOOD_DESCRIPTOR)}
			onPrimary={() => {}}
			secondaryText={false}
			hideCloseButton
			data-flx={dataFlx ?? 'app.generic-error-modal.confirm-modal'}
		/>
	);
});
