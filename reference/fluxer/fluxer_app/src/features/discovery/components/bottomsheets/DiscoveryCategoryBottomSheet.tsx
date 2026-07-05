// SPDX-License-Identifier: AGPL-3.0-or-later

import Discovery from '@app/features/discovery/state/Discovery';
import type {MenuGroupType} from '@app/features/ui/menu_bottom_sheet/MenuBottomSheet';
import {MenuBottomSheet} from '@app/features/ui/menu_bottom_sheet/MenuBottomSheet';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import {useCallback, useMemo} from 'react';

const ALL_DESCRIPTOR = msg({
	message: 'All',
	comment: 'Short label in the discovery category bottom sheet. Keep it concise.',
});
const CATEGORIES_DESCRIPTOR = msg({
	message: 'Categories',
	comment: 'Short label in the discovery category bottom sheet. Keep it concise.',
});

interface DiscoveryCategoryBottomSheetProps {
	isOpen: boolean;
	onClose: () => void;
}

export const DiscoveryCategoryBottomSheet = observer(function DiscoveryCategoryBottomSheet({
	isOpen,
	onClose,
}: DiscoveryCategoryBottomSheetProps) {
	const {i18n} = useLingui();
	const handleCategorySelect = useCallback(
		(categoryId: number | null) => {
			void Discovery.search({category: categoryId, offset: 0});
			onClose();
		},
		[onClose],
	);
	const groups: Array<MenuGroupType> = useMemo(
		() => [
			{
				items: [
					{
						label: i18n._(ALL_DESCRIPTOR),
						onClick: () => handleCategorySelect(null),
					},
					...Discovery.categories.map((cat) => ({
						label: cat.name,
						onClick: () => handleCategorySelect(cat.id),
					})),
				],
			},
		],
		[Discovery.categories, handleCategorySelect, i18n.locale],
	);
	return (
		<MenuBottomSheet
			isOpen={isOpen}
			onClose={onClose}
			groups={groups}
			title={i18n._(CATEGORIES_DESCRIPTOR)}
			data-flx="discovery.discovery-category-bottom-sheet.menu-bottom-sheet"
		/>
	);
});
