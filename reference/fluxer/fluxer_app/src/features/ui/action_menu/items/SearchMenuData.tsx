// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	LINK_COPIED_TO_CLIPBOARD_DESCRIPTOR,
	REVERSE_IMAGE_SEARCH_DESCRIPTOR,
	TRANSLATE_DESCRIPTOR,
} from '@app/features/i18n/utils/CommonMessageDescriptors';
import Translation from '@app/features/messaging/state/Translation';
import {SearchProviderPickerModal} from '@app/features/search/components/modals/SearchProviderPickerModal';
import ReverseImageSearch from '@app/features/search/state/ReverseImageSearch';
import SearchEngine from '@app/features/search/state/SearchEngine';
import {
	CopyLinkIcon,
	OpenMediaLinkIcon,
	SearchIcon,
	TranslateIcon,
} from '@app/features/ui/action_menu/ContextMenuIcons';
import {
	buildSearchProviderSheetItems,
	getSearchProviderMenuState,
} from '@app/features/ui/action_menu/items/SearchProviderMenuUtils';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {modal} from '@app/features/ui/commands/ModalCommands';
import * as TextCopyCommands from '@app/features/ui/commands/TextCopyCommands';
import * as ToastCommands from '@app/features/ui/commands/ToastCommands';
import type {
	MenuGroupType,
	MenuItemType,
	MenuSubmenuItemType,
} from '@app/features/ui/menu_bottom_sheet/MenuBottomSheet';
import {openExternalUrl} from '@app/features/ui/utils/NativeUtils';
import type {I18n} from '@lingui/core';
import {msg} from '@lingui/core/macro';

const COPY_IMAGE_URL_DESCRIPTOR = msg({
	message: 'Copy image URL',
	comment: 'Action that copies the image URL to the clipboard.',
});
const OPEN_IMAGE_IN_BROWSER_DESCRIPTOR = msg({
	message: 'Open image in browser',
	comment: 'Action that opens the image URL in an external browser.',
});
const DEFAULT_DESCRIPTOR = msg({
	message: 'Default',
	comment: 'Option label representing the default value.',
});
const SEARCH_THE_WEB_DESCRIPTOR = msg({
	message: 'Search the web',
	comment: 'Action that opens a web search for the selected text or media.',
});

interface ReverseImageSearchMenuOptions {
	i18n: I18n;
	onClose: () => void;
	defaultLabel?: string;
	includeCopyAndOpen?: boolean;
	copyLabel?: string;
	openLabel?: string;
}

const openReverseImageSearchWith = (engineId: string, url: string) => {
	const target = ReverseImageSearch.buildSearchUrl(engineId, url);
	if (target) {
		void openExternalUrl(target);
	}
};

export function buildReverseImageSearchMenuGroups(
	imageUrl: string | null | undefined,
	options: ReverseImageSearchMenuOptions,
): Array<MenuGroupType> {
	if (!imageUrl) return [];
	const {i18n, onClose, includeCopyAndOpen = false} = options;
	const defaultLabel = options.defaultLabel ?? i18n._(REVERSE_IMAGE_SEARCH_DESCRIPTOR);
	const copyLabel = options.copyLabel ?? i18n._(COPY_IMAGE_URL_DESCRIPTOR);
	const openLabel = options.openLabel ?? i18n._(OPEN_IMAGE_IN_BROWSER_DESCRIPTOR);
	const state = getSearchProviderMenuState(ReverseImageSearch);
	const items: Array<MenuItemType | MenuSubmenuItemType> = [];
	if (includeCopyAndOpen) {
		items.push({
			icon: (
				<CopyLinkIcon
					size={20}
					data-flx="ui.action-menu.items.search-menu-data.build-reverse-image-search-menu-groups.copy-link-icon"
				/>
			),
			label: copyLabel,
			onClick: async () => {
				await TextCopyCommands.copy(i18n, imageUrl, true);
				ToastCommands.createToast({
					type: 'success',
					children: i18n._(LINK_COPIED_TO_CLIPBOARD_DESCRIPTOR),
				});
				onClose();
			},
		});
		items.push({
			icon: (
				<OpenMediaLinkIcon
					size={20}
					data-flx="ui.action-menu.items.search-menu-data.build-reverse-image-search-menu-groups.open-media-link-icon"
				/>
			),
			label: openLabel,
			onClick: () => {
				void openExternalUrl(imageUrl);
				onClose();
			},
		});
	}
	if (state.enabledEngines.length > 0) {
		const handleDefault = () => {
			const defaultEngine = ReverseImageSearch.defaultEngine;
			if (defaultEngine) {
				openReverseImageSearchWith(defaultEngine.id, imageUrl);
				onClose();
				return;
			}
			const targetImageUrl = imageUrl;
			ModalCommands.pushAfterBottomSheetClose(
				onClose,
				modal(() => (
					<SearchProviderPickerModal
						mode="image"
						onPick={(engineId) => openReverseImageSearchWith(engineId, targetImageUrl)}
						data-flx="ui.action-menu.items.search-menu-data.handle-default.search-provider-picker-modal"
					/>
				)),
			);
		};
		items.push(
			...buildSearchProviderSheetItems(state, {
				defaultLabel,
				defaultSubtext: i18n._(DEFAULT_DESCRIPTOR),
				renderIcon: () => (
					<SearchIcon size={20} data-flx="ui.action-menu.items.search-menu-data.render-icon.search-icon" />
				),
				onDefaultSearch: handleDefault,
				onSearchWithEngine: (engine) => {
					openReverseImageSearchWith(engine.id, imageUrl);
					onClose();
				},
			}),
		);
	}
	if (items.length === 0) return [];
	return [{items}];
}

interface WebSearchMenuOptions {
	i18n: I18n;
	onClose: () => void;
}

const openWebSearchWith = (engineId: string, query: string) => {
	const url = SearchEngine.buildSearchUrl(engineId, query);
	if (url) {
		void openExternalUrl(url);
	}
};

export function buildWebSearchMenuGroup(selectionText: string, options: WebSearchMenuOptions): MenuGroupType | null {
	if (!selectionText) return null;
	const {i18n, onClose} = options;
	const state = getSearchProviderMenuState(SearchEngine);
	if (state.enabledEngines.length === 0) return null;
	const handleDefault = () => {
		const defaultEngine = SearchEngine.defaultEngine;
		if (defaultEngine) {
			openWebSearchWith(defaultEngine.id, selectionText);
			onClose();
			return;
		}
		const queryToSearch = selectionText;
		ModalCommands.pushAfterBottomSheetClose(
			onClose,
			modal(() => (
				<SearchProviderPickerModal
					mode="text"
					onPick={(engineId) => openWebSearchWith(engineId, queryToSearch)}
					data-flx="ui.action-menu.items.search-menu-data.handle-default.search-provider-picker-modal--2"
				/>
			)),
		);
	};
	const items = buildSearchProviderSheetItems(state, {
		defaultLabel: i18n._(SEARCH_THE_WEB_DESCRIPTOR),
		defaultSubtext: i18n._(DEFAULT_DESCRIPTOR),
		renderIcon: () => (
			<SearchIcon size={20} data-flx="ui.action-menu.items.search-menu-data.render-icon.search-icon--2" />
		),
		onDefaultSearch: handleDefault,
		onSearchWithEngine: (engine) => {
			openWebSearchWith(engine.id, selectionText);
			onClose();
		},
	});
	return {items};
}

interface TranslateMenuOptions {
	i18n: I18n;
	onClose: () => void;
}

const openTranslateWith = (engineId: string, query: string) => {
	const url = Translation.buildSearchUrl(engineId, query);
	if (url) {
		void openExternalUrl(url);
	}
};

export function buildTranslateMenuGroup(selectionText: string, options: TranslateMenuOptions): MenuGroupType | null {
	if (!selectionText) return null;
	const {i18n, onClose} = options;
	const state = getSearchProviderMenuState(Translation);
	if (state.enabledEngines.length === 0) return null;
	const handleDefault = () => {
		const defaultEngine = Translation.defaultEngine;
		if (defaultEngine) {
			openTranslateWith(defaultEngine.id, selectionText);
			onClose();
			return;
		}
		const queryToTranslate = selectionText;
		ModalCommands.pushAfterBottomSheetClose(
			onClose,
			modal(() => (
				<SearchProviderPickerModal
					mode="translate"
					onPick={(engineId) => openTranslateWith(engineId, queryToTranslate)}
					data-flx="ui.action-menu.items.search-menu-data.handle-default.search-provider-picker-modal--3"
				/>
			)),
		);
	};
	const items = buildSearchProviderSheetItems(state, {
		defaultLabel: i18n._(TRANSLATE_DESCRIPTOR),
		defaultSubtext: i18n._(DEFAULT_DESCRIPTOR),
		renderIcon: () => (
			<TranslateIcon size={20} data-flx="ui.action-menu.items.search-menu-data.render-icon.translate-icon" />
		),
		onDefaultSearch: handleDefault,
		onSearchWithEngine: (engine) => {
			openTranslateWith(engine.id, selectionText);
			onClose();
		},
	});
	return {items};
}
