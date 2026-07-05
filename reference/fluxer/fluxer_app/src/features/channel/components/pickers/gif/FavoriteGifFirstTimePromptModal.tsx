// SPDX-License-Identifier: AGPL-3.0-or-later

import * as Modal from '@app/features/app/components/dialogs/Modal';
import styles from '@app/features/channel/components/pickers/gif/FavoriteGifFirstTimePromptModal.module.css';
import FavoriteGif from '@app/features/expressions/state/FavoriteGif';
import {Button} from '@app/features/ui/button/Button';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {formatUserSettingsPath} from '@app/features/user/components/settings_utils/SettingsConstants';
import {msg} from '@lingui/core/macro';
import {Trans, useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import {useRef} from 'react';

const HOW_SHOULD_WE_SAVE_YOUR_GIF_FAVORITES_DESCRIPTOR = msg({
	message: 'How should we save your GIF favorites?',
	comment: 'Confirmation prompt in the channel and chat favorite gif first time prompt modal.',
});

interface FavoriteGifFirstTimePromptModalProps {
	onConfirm: () => void;
}

export const FavoriteGifFirstTimePromptModal = observer(function FavoriteGifFirstTimePromptModal({
	onConfirm,
}: FavoriteGifFirstTimePromptModalProps) {
	const {i18n} = useLingui();
	const initialFocusRef = useRef<HTMLButtonElement | null>(null);
	const mediaSettingsPath = formatUserSettingsPath(i18n, 'chat_settings', 'media');
	const handleConfirm = () => {
		FavoriteGif.setSaveGifFavoritesAsSavedMedia(false);
		FavoriteGif.markFirstTimePromptSeen();
		ModalCommands.pop();
		onConfirm();
	};
	const handleUseSavedMedia = () => {
		FavoriteGif.setSaveGifFavoritesAsSavedMedia(true);
		FavoriteGif.markFirstTimePromptSeen();
		ModalCommands.pop();
		onConfirm();
	};
	const handleCancel = () => {
		ModalCommands.pop();
	};
	return (
		<Modal.Root
			size="small"
			centered
			initialFocusRef={initialFocusRef}
			data-flx="channel.pickers.gif.favorite-gif-first-time-prompt-modal.modal-root"
		>
			<Modal.Header
				title={i18n._(HOW_SHOULD_WE_SAVE_YOUR_GIF_FAVORITES_DESCRIPTOR)}
				onClose={handleCancel}
				data-flx="channel.pickers.gif.favorite-gif-first-time-prompt-modal.modal-header"
			/>
			<Modal.Content data-flx="channel.pickers.gif.favorite-gif-first-time-prompt-modal.modal-content">
				<div className={styles.body} data-flx="channel.pickers.gif.favorite-gif-first-time-prompt-modal.body">
					<p
						className={styles.description}
						data-flx="channel.pickers.gif.favorite-gif-first-time-prompt-modal.description"
					>
						<Trans>
							You can store starred GIFs as URL-only favorites or upload them to your saved media. Pick the one that
							fits how you use them. You can change it any time in {mediaSettingsPath}.
						</Trans>
					</p>
					<ul className={styles.list} data-flx="channel.pickers.gif.favorite-gif-first-time-prompt-modal.list">
						<li
							className={styles.listItem}
							data-flx="channel.pickers.gif.favorite-gif-first-time-prompt-modal.list-item"
						>
							<Trans>
								<strong data-flx="channel.pickers.gif.favorite-gif-first-time-prompt-modal.strong">
									URL-only favorites (default)
								</strong>
								: synced across your devices, no upload, doesn't count against saved media. The original media may
								disappear if its host removes it.
							</Trans>
						</li>
						<li
							className={styles.listItem}
							data-flx="channel.pickers.gif.favorite-gif-first-time-prompt-modal.list-item--2"
						>
							<Trans>
								<strong data-flx="channel.pickers.gif.favorite-gif-first-time-prompt-modal.strong--2">
									Saved media
								</strong>
								: uploaded, taggable, searchable, and persistent, but counts against your saved media limit.
							</Trans>
						</li>
					</ul>
					<p className={styles.hint} data-flx="channel.pickers.gif.favorite-gif-first-time-prompt-modal.hint">
						<Trans>We'll only ask once.</Trans>
					</p>
				</div>
			</Modal.Content>
			<Modal.Footer data-flx="channel.pickers.gif.favorite-gif-first-time-prompt-modal.modal-footer">
				<Button
					variant="secondary"
					onClick={handleUseSavedMedia}
					data-flx="channel.pickers.gif.favorite-gif-first-time-prompt-modal.button.use-saved-media"
				>
					<Trans>Use saved media</Trans>
				</Button>
				<Button
					variant="primary"
					onClick={handleConfirm}
					ref={initialFocusRef}
					data-flx="channel.pickers.gif.favorite-gif-first-time-prompt-modal.button.confirm"
				>
					<Trans>Use URL-only (recommended)</Trans>
				</Button>
			</Modal.Footer>
		</Modal.Root>
	);
});
