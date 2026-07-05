// SPDX-License-Identifier: AGPL-3.0-or-later

import type {MenuItemType, MenuSubmenuItemType} from '@app/features/ui/menu_bottom_sheet/MenuBottomSheet';
import type React from 'react';

export interface SearchProviderMenuEngine {
	id: string;
	name: string;
}

interface SearchProviderMenuSource<T extends SearchProviderMenuEngine> {
	enabledEngines: ReadonlyArray<T>;
	defaultEngine: T | null;
	nonDefaultEnabledEngines: ReadonlyArray<T>;
}

export interface SearchProviderMenuState<T extends SearchProviderMenuEngine> {
	enabledEngines: ReadonlyArray<T>;
	defaultEngine: T | null;
	alternateEngines: ReadonlyArray<T>;
}

export function getSearchProviderMenuState<T extends SearchProviderMenuEngine>(
	source: SearchProviderMenuSource<T>,
): SearchProviderMenuState<T> {
	const defaultEngine = source.defaultEngine;
	return {
		enabledEngines: source.enabledEngines,
		defaultEngine,
		alternateEngines: defaultEngine ? source.nonDefaultEnabledEngines : [],
	};
}

interface SearchProviderSheetItemOptions<T extends SearchProviderMenuEngine> {
	defaultLabel: string;
	defaultSubtext: string;
	renderIcon: () => React.ReactNode;
	onDefaultSearch: () => void;
	onSearchWithEngine: (engine: T) => void;
}

export function buildSearchProviderSheetItems<T extends SearchProviderMenuEngine>(
	state: SearchProviderMenuState<T>,
	options: SearchProviderSheetItemOptions<T>,
): Array<MenuItemType | MenuSubmenuItemType> {
	if (state.enabledEngines.length === 0) {
		return [];
	}
	if (state.alternateEngines.length > 0) {
		const submenuItems: Array<MenuItemType | MenuSubmenuItemType> = [];
		if (state.defaultEngine) {
			const defaultEngine = state.defaultEngine;
			submenuItems.push({
				label: defaultEngine.name,
				subtext: options.defaultSubtext,
				onClick: () => options.onSearchWithEngine(defaultEngine),
			});
		}
		for (const engine of state.alternateEngines) {
			submenuItems.push({
				label: engine.name,
				onClick: () => options.onSearchWithEngine(engine),
			});
		}
		return [
			{
				icon: options.renderIcon(),
				label: options.defaultLabel,
				onTriggerSelect: options.onDefaultSearch,
				items: submenuItems,
			},
		];
	}
	return [
		{
			icon: options.renderIcon(),
			label: options.defaultLabel,
			onClick: options.onDefaultSearch,
		},
	];
}
