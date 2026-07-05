// SPDX-License-Identifier: AGPL-3.0-or-later

import {RenameChannelModal} from '@app/features/channel/components/modals/RenameChannelModal';
import {DELETE_CATEGORY_DESCRIPTOR} from '@app/features/channel/utils/ChannelMessageDescriptors';
import {ADD_CHANNEL_DESCRIPTOR} from '@app/features/i18n/utils/CommonMessageDescriptors';
import Favorites from '@app/features/messaging/state/Favorites';
import {
	CollapseIcon,
	CreateChannelIcon,
	DeleteIcon,
	EditSimpleIcon,
	ExpandIcon,
} from '@app/features/ui/action_menu/ContextMenuIcons';
import {MenuGroup} from '@app/features/ui/action_menu/MenuGroup';
import {MenuItem} from '@app/features/ui/action_menu/MenuItem';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {modal} from '@app/features/ui/commands/ModalCommands';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';

const RENAME_CATEGORY_DESCRIPTOR = msg({
	message: 'Rename category',
	comment: 'Action that opens the rename flow for the selected channel category.',
});
const EXPAND_CATEGORY_DESCRIPTOR = msg({
	message: 'Expand category',
	comment: 'Action label that expands a collapsed channel category.',
});
const COLLAPSE_CATEGORY_DESCRIPTOR = msg({
	message: 'Collapse category',
	comment: 'Action that collapses the channel category section.',
});

interface FavoritesCategoryContextMenuProps {
	category: {id: string; name: string};
	onClose: () => void;
	onAddChannel: () => void;
}

export const FavoritesCategoryContextMenu: React.FC<FavoritesCategoryContextMenuProps> = observer(
	({category, onClose, onAddChannel}) => {
		const {i18n} = useLingui();
		const isCollapsed = Favorites.isCategoryCollapsed(category.id);
		const handleRename = () => {
			ModalCommands.pushAfterBottomSheetClose(
				onClose,
				modal(() => (
					<RenameChannelModal
						currentName={category.name}
						onSave={(name) => {
							Favorites.renameCategory(category.id, name);
						}}
						data-flx="ui.action-menu.favorites-category-context-menu.handle-rename.rename-channel-modal"
					/>
				)),
			);
		};
		const handleToggleCollapse = () => {
			Favorites.toggleCategoryCollapsed(category.id);
			onClose();
		};
		const handleRemove = () => {
			Favorites.removeCategory(category.id);
			onClose();
		};
		const handleAddChannelClick = () => {
			onClose();
			onAddChannel();
		};
		return (
			<>
				<MenuGroup data-flx="ui.action-menu.favorites-category-context-menu.menu-group">
					<MenuItem
						icon={<CreateChannelIcon data-flx="ui.action-menu.favorites-category-context-menu.create-channel-icon" />}
						onClick={handleAddChannelClick}
						data-flx="ui.action-menu.favorites-category-context-menu.menu-item.add-channel-click"
					>
						{i18n._(ADD_CHANNEL_DESCRIPTOR)}
					</MenuItem>
					<MenuItem
						icon={<EditSimpleIcon data-flx="ui.action-menu.favorites-category-context-menu.edit-simple-icon" />}
						onClick={handleRename}
						data-flx="ui.action-menu.favorites-category-context-menu.menu-item.rename"
					>
						{i18n._(RENAME_CATEGORY_DESCRIPTOR)}
					</MenuItem>
				</MenuGroup>
				<MenuGroup data-flx="ui.action-menu.favorites-category-context-menu.menu-group--2">
					<MenuItem
						icon={
							isCollapsed ? (
								<ExpandIcon data-flx="ui.action-menu.favorites-category-context-menu.expand-icon" />
							) : (
								<CollapseIcon data-flx="ui.action-menu.favorites-category-context-menu.collapse-icon" />
							)
						}
						onClick={handleToggleCollapse}
						data-flx="ui.action-menu.favorites-category-context-menu.menu-item.toggle-collapse"
					>
						{isCollapsed ? i18n._(EXPAND_CATEGORY_DESCRIPTOR) : i18n._(COLLAPSE_CATEGORY_DESCRIPTOR)}
					</MenuItem>
				</MenuGroup>
				<MenuGroup data-flx="ui.action-menu.favorites-category-context-menu.menu-group--3">
					<MenuItem
						icon={<DeleteIcon data-flx="ui.action-menu.favorites-category-context-menu.delete-icon" />}
						onClick={handleRemove}
						danger
						data-flx="ui.action-menu.favorites-category-context-menu.menu-item.remove"
					>
						{i18n._(DELETE_CATEGORY_DESCRIPTOR)}
					</MenuItem>
				</MenuGroup>
			</>
		);
	},
);
