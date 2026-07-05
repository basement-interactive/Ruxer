// SPDX-License-Identifier: AGPL-3.0-or-later

import {Scroller} from '@app/features/ui/components/Scroller';
import {
	getNextTabIndex,
	getTabNavigationDirection,
	type TabNavigationDirection,
} from '@app/features/ui/tabs/TabKeyboardNavigation';
import styles from '@app/features/ui/tabs/Tabs.module.css';
import {clsx} from 'clsx';
import {useRef} from 'react';

export interface TabItem<T extends string> {
	key: T;
	label: string | React.ReactNode;
}

export interface TabsProps<T extends string> {
	tabs: Array<TabItem<T>>;
	activeTab: T;
	onTabChange: (tab: T) => void;
	className?: string;
}

export function Tabs<T extends string>({tabs, activeTab, onTabChange, className}: TabsProps<T>) {
	const tabRefs = useRef<Map<T, HTMLButtonElement>>(new Map());
	const focusTab = (key: T) => {
		tabRefs.current.get(key)?.focus();
	};
	const getNextKey = (currentKey: T, direction: TabNavigationDirection | null): T | null => {
		if (!direction) return null;
		const currentIndex = tabs.findIndex((tab) => tab.key === currentKey);
		const nextIndex = getNextTabIndex(currentIndex, tabs.length, direction);
		return nextIndex == null ? null : (tabs[nextIndex]?.key ?? null);
	};
	const handleKeyDown = (event: React.KeyboardEvent, tabKey: T) => {
		const nextKey = getNextKey(tabKey, getTabNavigationDirection(event.key, 'horizontal'));
		if (!nextKey) return;
		event.preventDefault();
		event.stopPropagation();
		onTabChange(nextKey);
		focusTab(nextKey);
	};
	return (
		<Scroller orientation="horizontal" fade key="tabs-horizontal-scroller" data-flx="ui.tabs.scroller">
			<div
				role="tablist"
				aria-orientation="horizontal"
				className={clsx(styles.container, className)}
				data-flx="ui.tabs.container"
			>
				{tabs.map(({key, label}) => {
					const isSelected = key === activeTab;
					return (
						<button
							key={key}
							ref={(el) => {
								if (el) {
									tabRefs.current.set(key, el);
								} else {
									tabRefs.current.delete(key);
								}
							}}
							type="button"
							role="tab"
							aria-selected={isSelected}
							tabIndex={isSelected ? 0 : -1}
							className={clsx(styles.tab, isSelected && styles.selected)}
							onClick={() => onTabChange(key)}
							onKeyDown={(e) => handleKeyDown(e, key)}
							data-flx="ui.tabs.tab.button"
						>
							{label}
						</button>
					);
				})}
			</div>
		</Scroller>
	);
}
