// SPDX-License-Identifier: AGPL-3.0-or-later

import * as Modal from '@app/features/app/components/dialogs/Modal';
import {CANCEL_DESCRIPTOR} from '@app/features/i18n/utils/CommonMessageDescriptors';
import {Button} from '@app/features/ui/button/Button';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import PiP from '@app/features/ui/state/PiP';
import {formatUserSettingsPath} from '@app/features/user/components/settings_utils/SettingsConstants';
import * as VoiceSettingsCommands from '@app/features/voice/commands/VoiceSettingsCommands';
import {msg} from '@lingui/core/macro';
import {Trans, useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import {useRef} from 'react';

const DISABLE_SCREEN_SHARE_PIP_TITLE_DESCRIPTOR = msg({
	message: 'Disable screen share picture-in-picture popouts?',
	comment: 'Confirmation modal title before disabling screen share picture-in-picture popouts.',
});
const DISABLE_POPOUTS_DESCRIPTOR = msg({
	message: 'Disable popouts',
	comment: 'Confirm button that disables screen share picture-in-picture popouts.',
});

export const DisableScreenSharePiPConfirmModal = observer(function DisableScreenSharePiPConfirmModal() {
	const {i18n} = useLingui();
	const initialFocusRef = useRef<HTMLButtonElement | null>(null);
	const audioVideoSettingsPath = formatUserSettingsPath(i18n, 'voice_video');
	const handleConfirm = () => {
		VoiceSettingsCommands.update({disablePictureInPicturePopoutScreenShare: true});
		PiP.close();
		ModalCommands.pop();
	};
	const handleCancel = () => {
		ModalCommands.pop();
	};

	return (
		<Modal.Root
			size="small"
			centered
			initialFocusRef={initialFocusRef}
			data-flx="voice.disable-screen-share-pi-p-confirm-modal.modal-root"
		>
			<Modal.Header
				title={i18n._(DISABLE_SCREEN_SHARE_PIP_TITLE_DESCRIPTOR)}
				onClose={handleCancel}
				data-flx="voice.disable-screen-share-pi-p-confirm-modal.modal-header"
			/>
			<Modal.Content data-flx="voice.disable-screen-share-pi-p-confirm-modal.modal-content">
				<Modal.ContentLayout data-flx="voice.disable-screen-share-pi-p-confirm-modal.modal-content-layout">
					<Modal.Description data-flx="voice.disable-screen-share-pi-p-confirm-modal.description">
						<Trans>
							This will close the current popout and stop screen share picture-in-picture popouts from opening
							automatically. You can turn them back on in {audioVideoSettingsPath}.
						</Trans>
					</Modal.Description>
				</Modal.ContentLayout>
			</Modal.Content>
			<Modal.Footer data-flx="voice.disable-screen-share-pi-p-confirm-modal.modal-footer">
				<Button
					variant="secondary"
					onClick={handleCancel}
					data-flx="voice.disable-screen-share-pi-p-confirm-modal.button.cancel"
				>
					{i18n._(CANCEL_DESCRIPTOR)}
				</Button>
				<Button
					variant="primary"
					onClick={handleConfirm}
					ref={initialFocusRef}
					data-flx="voice.disable-screen-share-pi-p-confirm-modal.button.confirm"
				>
					{i18n._(DISABLE_POPOUTS_DESCRIPTOR)}
				</Button>
			</Modal.Footer>
		</Modal.Root>
	);
});
