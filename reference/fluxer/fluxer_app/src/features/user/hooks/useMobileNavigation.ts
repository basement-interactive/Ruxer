// SPDX-License-Identifier: AGPL-3.0-or-later

import type {UserSettingsTabType} from '@app/features/user/components/settings_utils/SettingsSectionRegistry';
import {useCallback, useReducer} from 'react';

interface NavigationStackItem<T = UserSettingsTabType> {
	tab: T;
	title: string;
}

export interface MobileNavigationState<T = UserSettingsTabType> {
	navigationStack: Array<NavigationStackItem<T>>;
	direction: 'forward' | 'backward';
	currentView: NavigationStackItem<T> | undefined;
	isRootView: boolean;
	navigateTo: (tab: T, title: string) => void;
	navigateBack: () => void;
	resetToRoot: () => void;
}

type NavigationAction<T = UserSettingsTabType> =
	| {
			type: 'NAVIGATE_FORWARD';
			payload: NavigationStackItem<T>;
	  }
	| {
			type: 'NAVIGATE_BACK';
	  }
	| {
			type: 'RESET_TO_ROOT';
	  };

interface NavigationReducerState<T = UserSettingsTabType> {
	stack: Array<NavigationStackItem<T>>;
	direction: 'forward' | 'backward';
}

function navigationReducer<T>(
	state: NavigationReducerState<T>,
	action: NavigationAction<T>,
): NavigationReducerState<T> {
	switch (action.type) {
		case 'NAVIGATE_FORWARD':
			return {
				stack: [...state.stack, action.payload],
				direction: 'forward',
			};
		case 'NAVIGATE_BACK':
			if (state.stack.length === 0) {
				return state;
			}
			return {
				stack: state.stack.slice(0, -1),
				direction: 'backward',
			};
		case 'RESET_TO_ROOT':
			return {
				stack: [],
				direction: 'backward',
			};
		default:
			return state;
	}
}

export const useMobileNavigation = <T = UserSettingsTabType>(initialTab?: {
	tab: T;
	title: string;
}): MobileNavigationState<T> => {
	const initialState: NavigationReducerState<T> = {
		stack: initialTab ? [initialTab] : [],
		direction: 'forward',
	};
	const [state, dispatch] = useReducer(navigationReducer, initialState);
	const navigateTo = useCallback((tab: T, title: string) => {
		dispatch({type: 'NAVIGATE_FORWARD', payload: {tab, title}});
	}, []);
	const navigateBack = useCallback(() => {
		dispatch({type: 'NAVIGATE_BACK'});
	}, []);
	const resetToRoot = useCallback(() => {
		dispatch({type: 'RESET_TO_ROOT'});
	}, []);
	const currentView = state.stack[state.stack.length - 1];
	const isRootView = state.stack.length === 0;
	return {
		navigationStack: state.stack,
		direction: state.direction,
		currentView,
		isRootView,
		navigateTo,
		navigateBack,
		resetToRoot,
	};
};
