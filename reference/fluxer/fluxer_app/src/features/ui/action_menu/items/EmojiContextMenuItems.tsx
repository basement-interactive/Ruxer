// SPDX-License-Identifier: AGPL-3.0-or-later

import * as EmojiPickerCommands from '@app/features/emoji/commands/EmojiPickerCommands';
import EmojiPicker from '@app/features/emoji/state/EmojiPicker';
import type {FlatEmoji} from '@app/features/emoji/types/EmojiTypes';
import Guilds from '@app/features/guild/state/Guilds';
import {LINK_COPIED_TO_CLIPBOARD_DESCRIPTOR} from '@app/features/i18n/utils/CommonMessageDescriptors';
import {CloneEmojiMenuItem} from '@app/features/ui/action_menu/items/CloneEmojiMenuItem';
import styles from '@app/features/ui/action_menu/items/MenuItems.module.css';
import {ReverseImageSearchMenuItems} from '@app/features/ui/action_menu/items/ReverseImageSearchMenuItems';
import {MenuGroup} from '@app/features/ui/action_menu/MenuGroup';
import {MenuItem} from '@app/features/ui/action_menu/MenuItem';
import {MenuItemSubmenu} from '@app/features/ui/action_menu/MenuItemSubmenu';
import * as TextCopyCommands from '@app/features/ui/commands/TextCopyCommands';
import * as ToastCommands from '@app/features/ui/commands/ToastCommands';
import {openExternalUrl} from '@app/features/ui/utils/NativeUtils';
import * as AvatarUtils from '@app/features/user/utils/AvatarUtils';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {ClipboardIcon, StarIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import {useCallback} from 'react';

const UNFAVORITE_EMOJI_DESCRIPTOR = msg({
	message: 'Unfavorite emoji',
	comment: 'Emoji context menu action that removes the emoji from favorites.',
});
const FAVORITE_EMOJI_DESCRIPTOR = msg({
	message: 'Favorite emoji',
	comment: 'Emoji context menu action that adds the emoji to favorites.',
});
const COPY_EMOJI_ID_DESCRIPTOR = msg({
	message: 'Copy emoji ID',
	comment: 'Developer-mode action that copies the emoji ID to the clipboard.',
});
const COPY_EMOJI_URL_DESCRIPTOR = msg({
	message: 'Copy emoji URL',
	comment: 'Action that copies the emoji URL to the clipboard.',
});
const OPEN_EMOJI_IN_BROWSER_DESCRIPTOR = msg({
	message: 'Open emoji in browser',
	comment: 'Action that opens the emoji URL in an external browser.',
});
const COPY_IMAGE_LINK_DESCRIPTOR = msg({
	message: 'Copy image link',
	comment: 'Image context menu action that copies the image URL to the clipboard.',
});
const OPEN_IMAGE_LINK_DESCRIPTOR = msg({
	message: 'Open image link',
	comment: 'Image context menu action that opens the image URL in an external browser.',
});
const MORE_EMOJI_ACTIONS_DESCRIPTOR = msg({
	message: 'More emoji actions',
	comment: 'Submenu label that contains additional emoji context menu actions.',
});

interface EmojiContextMenuItemsProps {
	emoji: FlatEmoji;
	onClose: () => void;
}

const useEmojiHandlers = (emoji: FlatEmoji, onClose: () => void) => {
	const {i18n} = useLingui();
	const canFavorite = !emoji.id || Boolean(emoji.guildId && Guilds.getGuild(emoji.guildId));
	const isFavorite = canFavorite ? EmojiPicker.isFavorite(emoji) : false;
	const reverseImageSearchUrl = emoji.id
		? AvatarUtils.getEmojiURL({id: emoji.id, animated: emoji.animated})
		: (emoji.url ?? null);
	const handleToggleFavorite = useCallback(() => {
		EmojiPickerCommands.toggleFavorite(emoji);
	}, [emoji]);
	const handleCopyId = useCallback(() => {
		if (!emoji.id) return;
		TextCopyCommands.copy(i18n, emoji.id);
		onClose();
	}, [i18n, emoji.id, onClose]);
	const handleCopyUrl = useCallback(async () => {
		if (!reverseImageSearchUrl) return;
		await TextCopyCommands.copy(i18n, reverseImageSearchUrl, true);
		ToastCommands.createToast({
			type: 'success',
			children: i18n._(LINK_COPIED_TO_CLIPBOARD_DESCRIPTOR),
		});
		onClose();
	}, [i18n, reverseImageSearchUrl, onClose]);
	const handleOpenInBrowser = useCallback(() => {
		if (!reverseImageSearchUrl) return;
		void openExternalUrl(reverseImageSearchUrl);
		onClose();
	}, [reverseImageSearchUrl, onClose]);
	return {
		canFavorite,
		isFavorite,
		reverseImageSearchUrl,
		handleToggleFavorite,
		handleCopyId,
		handleCopyUrl,
		handleOpenInBrowser,
	};
};
export const EmojiContextMenuItems = observer(({emoji, onClose}: EmojiContextMenuItemsProps) => {
	const {i18n} = useLingui();
	const {canFavorite, isFavorite, reverseImageSearchUrl, handleToggleFavorite, handleCopyId} = useEmojiHandlers(
		emoji,
		onClose,
	);
	const shouldShowPrimaryGroup = canFavorite || Boolean(emoji.id);
	return (
		<>
			{shouldShowPrimaryGroup && (
				<MenuGroup data-flx="ui.action-menu.items.emoji-context-menu-items.menu-group">
					{canFavorite && (
						<MenuItem
							icon={
								<StarIcon
									className={styles.iconSmall}
									weight={isFavorite ? 'fill' : 'bold'}
									data-flx="ui.action-menu.items.emoji-context-menu-items.icon-small"
								/>
							}
							onClick={handleToggleFavorite}
							data-flx="ui.action-menu.items.emoji-context-menu-items.menu-item.toggle-favorite"
						>
							{isFavorite ? i18n._(UNFAVORITE_EMOJI_DESCRIPTOR) : i18n._(FAVORITE_EMOJI_DESCRIPTOR)}
						</MenuItem>
					)}
					{emoji.id && (
						<MenuItem
							icon={
								<ClipboardIcon
									className={styles.iconSmall}
									data-flx="ui.action-menu.items.emoji-context-menu-items.icon-small--2"
								/>
							}
							onClick={handleCopyId}
							data-flx="ui.action-menu.items.emoji-context-menu-items.menu-item.copy-id"
						>
							{i18n._(COPY_EMOJI_ID_DESCRIPTOR)}
						</MenuItem>
					)}
				</MenuGroup>
			)}
			{emoji.id && (
				<CloneEmojiMenuItem
					emoji={emoji}
					onClose={onClose}
					data-flx="ui.action-menu.items.emoji-context-menu-items.clone-emoji-menu-item"
				/>
			)}
			{reverseImageSearchUrl && (
				<ReverseImageSearchMenuItems
					imageUrl={reverseImageSearchUrl}
					onClose={onClose}
					wrapInGroup
					includeCopyAndOpen
					copyLabel={i18n._(COPY_EMOJI_URL_DESCRIPTOR)}
					openLabel={i18n._(OPEN_EMOJI_IN_BROWSER_DESCRIPTOR)}
					data-flx="ui.action-menu.items.emoji-context-menu-items.reverse-image-search-menu-items"
				/>
			)}
		</>
	);
});

EmojiContextMenuItems.displayName = 'EmojiContextMenuItems';

export const EmojiInlineMenuItems = observer(({emoji, onClose}: EmojiContextMenuItemsProps) => {
	const {i18n} = useLingui();
	const {
		canFavorite,
		isFavorite,
		reverseImageSearchUrl,
		handleToggleFavorite,
		handleCopyId,
		handleCopyUrl,
		handleOpenInBrowser,
	} = useEmojiHandlers(emoji, onClose);
	if (!canFavorite && !emoji.id && !reverseImageSearchUrl) {
		return null;
	}
	const showSubmenu = Boolean(emoji.id) || Boolean(reverseImageSearchUrl);
	return (
		<MenuGroup data-flx="ui.action-menu.items.emoji-context-menu-items.emoji-inline-menu-items.menu-group">
			{canFavorite && (
				<MenuItem
					onClick={handleToggleFavorite}
					data-flx="ui.action-menu.items.emoji-context-menu-items.emoji-inline-menu-items.menu-item.toggle-favorite"
				>
					{isFavorite ? i18n._(UNFAVORITE_EMOJI_DESCRIPTOR) : i18n._(FAVORITE_EMOJI_DESCRIPTOR)}
				</MenuItem>
			)}
			{reverseImageSearchUrl && (
				<MenuItem
					onClick={handleCopyUrl}
					data-flx="ui.action-menu.items.emoji-context-menu-items.emoji-inline-menu-items.menu-item.copy-url"
				>
					{i18n._(COPY_IMAGE_LINK_DESCRIPTOR)}
				</MenuItem>
			)}
			{reverseImageSearchUrl && (
				<MenuItem
					onClick={handleOpenInBrowser}
					data-flx="ui.action-menu.items.emoji-context-menu-items.emoji-inline-menu-items.menu-item.open-in-browser"
				>
					{i18n._(OPEN_IMAGE_LINK_DESCRIPTOR)}
				</MenuItem>
			)}
			{showSubmenu && (
				<MenuItemSubmenu
					label={i18n._(MORE_EMOJI_ACTIONS_DESCRIPTOR)}
					render={() => (
						<>
							{emoji.id && (
								<MenuGroup data-flx="ui.action-menu.items.emoji-context-menu-items.emoji-inline-menu-items.menu-group--2">
									<MenuItem
										icon={
											<ClipboardIcon
												className={styles.iconSmall}
												data-flx="ui.action-menu.items.emoji-context-menu-items.emoji-inline-menu-items.icon-small"
											/>
										}
										onClick={handleCopyId}
										data-flx="ui.action-menu.items.emoji-context-menu-items.emoji-inline-menu-items.menu-item.copy-id"
									>
										{i18n._(COPY_EMOJI_ID_DESCRIPTOR)}
									</MenuItem>
								</MenuGroup>
							)}
							{emoji.id && (
								<CloneEmojiMenuItem
									emoji={emoji}
									onClose={onClose}
									data-flx="ui.action-menu.items.emoji-context-menu-items.emoji-inline-menu-items.clone-emoji-menu-item"
								/>
							)}
							{reverseImageSearchUrl && (
								<ReverseImageSearchMenuItems
									imageUrl={reverseImageSearchUrl}
									onClose={onClose}
									wrapInGroup
									data-flx="ui.action-menu.items.emoji-context-menu-items.emoji-inline-menu-items.reverse-image-search-menu-items"
								/>
							)}
						</>
					)}
					data-flx="ui.action-menu.items.emoji-context-menu-items.emoji-inline-menu-items.menu-item-submenu"
				/>
			)}
		</MenuGroup>
	);
});

EmojiInlineMenuItems.displayName = 'EmojiInlineMenuItems';
