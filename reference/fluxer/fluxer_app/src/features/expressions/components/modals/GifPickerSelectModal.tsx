// SPDX-License-Identifier: AGPL-3.0-or-later

import * as Modal from '@app/features/app/components/dialogs/Modal';
import {GifPicker} from '@app/features/channel/components/pickers/gif/GifPicker';
import type {Gif} from '@app/features/expressions/commands/GifCommands';
import styles from '@app/features/expressions/components/modals/GifPickerSelectModal.module.css';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {useCallback} from 'react';

interface GifPickerSelectModalProps {
	title: string;
	onSelect: (gif: Gif) => void;
}

export function GifPickerSelectModal({title, onSelect}: GifPickerSelectModalProps) {
	const handleClose = useCallback(() => {
		ModalCommands.pop();
	}, []);
	return (
		<Modal.Root size="small" className={styles.root} data-flx="expressions.gif-picker-select-modal.modal-root">
			<Modal.Header title={title} onClose={handleClose} data-flx="expressions.gif-picker-select-modal.modal-header" />
			<div className={styles.pickerBody} data-flx="expressions.gif-picker-select-modal.picker-body">
				<GifPicker
					selectGif={onSelect}
					onClose={handleClose}
					data-flx="expressions.gif-picker-select-modal.gif-picker"
				/>
			</div>
		</Modal.Root>
	);
}
