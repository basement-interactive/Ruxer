// SPDX-License-Identifier: AGPL-3.0-or-later

import * as Modal from '@app/features/app/components/dialogs/Modal';
import {CANCEL_DESCRIPTOR} from '@app/features/i18n/utils/CommonMessageDescriptors';
import {Button} from '@app/features/ui/button/Button';
import {Checkbox} from '@app/features/ui/checkbox/Checkbox';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import * as VoiceSettingsCommands from '@app/features/voice/commands/VoiceSettingsCommands';
import styles from '@app/features/voice/components/modals/HideOwnCameraConfirmModal.module.css';
import VoicePrompts from '@app/features/voice/state/VoicePrompts';
import {msg} from '@lingui/core/macro';
import {Trans, useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import {useRef, useState} from 'react';

const HIDE_DESCRIPTOR = msg({
	message: 'Hide',
	comment: 'Confirm button on the hide-own-camera dialog that hides the local camera tile.',
});
export const HideOwnCameraConfirmModal = observer(() => {
	const {i18n} = useLingui();
	const [dontAskAgain, setDontAskAgain] = useState(false);
	const initialFocusRef = useRef<HTMLButtonElement | null>(null);
	const handleConfirm = () => {
		if (dontAskAgain) VoicePrompts.setSkipHideOwnCameraConfirm(true);
		VoiceSettingsCommands.update({showMyOwnCamera: false});
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
			data-flx="voice.hide-own-camera-confirm-modal.modal-root"
		>
			<Modal.Header
				title={<Trans>Hide your own camera?</Trans>}
				data-flx="voice.hide-own-camera-confirm-modal.modal-header"
			/>
			<Modal.Content data-flx="voice.hide-own-camera-confirm-modal.modal-content">
				<Modal.ContentLayout data-flx="voice.hide-own-camera-confirm-modal.modal-content-layout">
					<Modal.Description data-flx="voice.hide-own-camera-confirm-modal.description">
						<Trans>
							Turning this off only hides your camera from your own view. Others in the call can still see your camera
							feed.
						</Trans>
					</Modal.Description>
					<div className={styles.checkboxContainer} data-flx="voice.hide-own-camera-confirm-modal.checkbox-container">
						<Checkbox
							checked={dontAskAgain}
							onChange={(checked) => setDontAskAgain(checked)}
							size="small"
							data-flx="voice.hide-own-camera-confirm-modal.checkbox.set-dont-ask-again"
						>
							<span className={styles.checkboxLabel} data-flx="voice.hide-own-camera-confirm-modal.checkbox-label">
								<Trans>Don't ask me again</Trans>
							</span>
						</Checkbox>
					</div>
				</Modal.ContentLayout>
			</Modal.Content>
			<Modal.Footer data-flx="voice.hide-own-camera-confirm-modal.modal-footer">
				<Button variant="secondary" onClick={handleCancel} data-flx="voice.hide-own-camera-confirm-modal.button.cancel">
					{i18n._(CANCEL_DESCRIPTOR)}
				</Button>
				<Button
					variant="primary"
					onClick={handleConfirm}
					ref={initialFocusRef}
					data-flx="voice.hide-own-camera-confirm-modal.button.confirm"
				>
					{i18n._(HIDE_DESCRIPTOR)}
				</Button>
			</Modal.Footer>
		</Modal.Root>
	);
});
