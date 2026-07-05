// SPDX-License-Identifier: AGPL-3.0-or-later

import {MuteDurationSheet} from '@app/features/app/components/bottomsheets/MuteDurationSheet';
import type {Channel} from '@app/features/channel/models/Channel';
import {MUTE_CATEGORY_DESCRIPTOR, UNMUTE_CATEGORY_DESCRIPTOR} from '@app/features/i18n/utils/CommonMessageDescriptors';
import {useMuteSheet} from '@app/features/notification/hooks/useMuteSheet';
import {useCategoryMenuData} from '@app/features/ui/action_menu/items/CategoryMenuData';
import {MenuBottomSheet} from '@app/features/ui/menu_bottom_sheet/MenuBottomSheet';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useMemo} from 'react';

const CATEGORY_OPTIONS_DESCRIPTOR = msg({
	message: 'Category options',
	comment: 'Short label in the category bottom sheet. Keep it concise.',
});

interface CategoryBottomSheetProps {
	isOpen: boolean;
	onClose: () => void;
	category: Channel;
}

export const CategoryBottomSheet: React.FC<CategoryBottomSheetProps> = observer(({isOpen, onClose, category}) => {
	const {i18n} = useLingui();
	const additionalMutePayload = useMemo(() => ({collapsed: true}), []);
	const {muteSheetOpen, openMuteSheet, closeMuteSheet, handleMute, handleUnmute, muteConfig} = useMuteSheet({
		guildId: category.guildId ?? null,
		channelId: category.id,
		additionalMutePayload,
	});
	const {groups, state} = useCategoryMenuData(category, {
		onClose,
		onOpenMuteSheet: openMuteSheet,
	});
	return (
		<>
			<MenuBottomSheet
				isOpen={isOpen}
				onClose={onClose}
				groups={groups}
				title={category.name ?? i18n._(CATEGORY_OPTIONS_DESCRIPTOR)}
				data-flx="channel.category-bottom-sheet.menu-bottom-sheet"
			/>
			<MuteDurationSheet
				isOpen={muteSheetOpen}
				onClose={closeMuteSheet}
				isMuted={state.isMuted}
				mutedText={state.mutedText}
				muteConfig={muteConfig}
				muteTitle={i18n._(MUTE_CATEGORY_DESCRIPTOR)}
				unmuteTitle={i18n._(UNMUTE_CATEGORY_DESCRIPTOR)}
				onMute={handleMute}
				onUnmute={handleUnmute}
				data-flx="channel.category-bottom-sheet.mute-duration-sheet"
			/>
		</>
	);
});
