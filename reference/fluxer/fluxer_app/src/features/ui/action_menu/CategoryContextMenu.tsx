// SPDX-License-Identifier: AGPL-3.0-or-later

import type {Channel} from '@app/features/channel/models/Channel';
import {MUTE_CATEGORY_DESCRIPTOR, UNMUTE_CATEGORY_DESCRIPTOR} from '@app/features/i18n/utils/CommonMessageDescriptors';
import {DataMenuRenderer} from '@app/features/ui/action_menu/DataMenuRenderer';
import {useCategoryMenuData} from '@app/features/ui/action_menu/items/CategoryMenuData';
import {MuteCategoryMenuItem} from '@app/features/ui/action_menu/items/CategoryMenuItems';
import {MenuGroup} from '@app/features/ui/action_menu/MenuGroup';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useMemo} from 'react';

interface CategoryContextMenuProps {
	category: Channel;
	onClose: () => void;
}

export const CategoryContextMenu: React.FC<CategoryContextMenuProps> = observer(({category, onClose}) => {
	const {i18n} = useLingui();
	const {groups} = useCategoryMenuData(category, {onClose});
	const excludeLabels = useMemo(
		() => [i18n._(MUTE_CATEGORY_DESCRIPTOR), i18n._(UNMUTE_CATEGORY_DESCRIPTOR)],
		[i18n.locale],
	);
	return (
		<>
			<DataMenuRenderer
				groups={groups}
				excludeLabels={excludeLabels}
				data-flx="ui.action-menu.category-context-menu.data-menu-renderer"
			/>
			<MenuGroup data-flx="ui.action-menu.category-context-menu.menu-group">
				<MuteCategoryMenuItem
					category={category}
					onClose={onClose}
					data-flx="ui.action-menu.category-context-menu.mute-category-menu-item"
				/>
			</MenuGroup>
		</>
	);
});
