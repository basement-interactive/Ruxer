// SPDX-License-Identifier: AGPL-3.0-or-later

import {AddFavoriteChannelModal} from '@app/features/expressions/components/modals/AddFavoriteChannelModal';
import {CreateFavoriteCategoryModal} from '@app/features/expressions/components/modals/CreateFavoriteCategoryModal';
import {
	ADD_CHANNEL_DESCRIPTOR,
	CREATE_CATEGORY_DESCRIPTOR,
	HIDE_MUTED_CHANNELS_DESCRIPTOR,
} from '@app/features/i18n/utils/CommonMessageDescriptors';
import Favorites from '@app/features/messaging/state/Favorites';
import {CheckboxItem} from '@app/features/ui/action_menu/ContextMenu';
import {CreateCategoryIcon, CreateChannelIcon} from '@app/features/ui/action_menu/ContextMenuIcons';
import {MenuGroup} from '@app/features/ui/action_menu/MenuGroup';
import {MenuItem} from '@app/features/ui/action_menu/MenuItem';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {modal} from '@app/features/ui/commands/ModalCommands';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback} from 'react';

interface FavoritesChannelListContextMenuProps {
	onClose: () => void;
}

export const FavoritesChannelListContextMenu: React.FC<FavoritesChannelListContextMenuProps> = observer(({onClose}) => {
	const {i18n} = useLingui();
	const hideMutedChannels = Favorites.hideMutedChannels;
	const handleToggleHideMutedChannels = useCallback((checked: boolean) => {
		Favorites.setHideMutedChannels(checked);
	}, []);
	const handleAddChannel = useCallback(() => {
		ModalCommands.pushAfterBottomSheetClose(
			onClose,
			modal(() => (
				<AddFavoriteChannelModal data-flx="ui.action-menu.favorites-channel-list-context-menu.handle-add-channel.add-favorite-channel-modal" />
			)),
		);
	}, [onClose]);
	const handleCreateCategory = useCallback(() => {
		ModalCommands.pushAfterBottomSheetClose(
			onClose,
			modal(() => (
				<CreateFavoriteCategoryModal data-flx="ui.action-menu.favorites-channel-list-context-menu.handle-create-category.create-favorite-category-modal" />
			)),
		);
	}, [onClose]);
	return (
		<>
			<MenuGroup data-flx="ui.action-menu.favorites-channel-list-context-menu.menu-group">
				<CheckboxItem
					checked={hideMutedChannels}
					onCheckedChange={handleToggleHideMutedChannels}
					data-flx="ui.action-menu.favorites-channel-list-context-menu.checkbox-item"
				>
					{i18n._(HIDE_MUTED_CHANNELS_DESCRIPTOR)}
				</CheckboxItem>
			</MenuGroup>
			<MenuGroup data-flx="ui.action-menu.favorites-channel-list-context-menu.menu-group--2">
				<MenuItem
					icon={<CreateChannelIcon data-flx="ui.action-menu.favorites-channel-list-context-menu.create-channel-icon" />}
					onClick={handleAddChannel}
					data-flx="ui.action-menu.favorites-channel-list-context-menu.menu-item.add-channel"
				>
					{i18n._(ADD_CHANNEL_DESCRIPTOR)}
				</MenuItem>
				<MenuItem
					icon={
						<CreateCategoryIcon data-flx="ui.action-menu.favorites-channel-list-context-menu.create-category-icon" />
					}
					onClick={handleCreateCategory}
					data-flx="ui.action-menu.favorites-channel-list-context-menu.menu-item.create-category"
				>
					{i18n._(CREATE_CATEGORY_DESCRIPTOR)}
				</MenuItem>
			</MenuGroup>
		</>
	);
});
