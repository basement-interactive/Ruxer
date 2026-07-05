// SPDX-License-Identifier: AGPL-3.0-or-later

import Keybind, {type KeybindCommand} from '@app/features/input/state/InputKeybind';
import {buildAssignableActionOptions} from '@app/features/user/components/modals/tabs/keybinds_tab/AssignableActionOptions';
import type {ActionOption} from '@app/features/user/components/modals/tabs/keybinds_tab/shared';
import {useLingui} from '@lingui/react/macro';
import {useMemo} from 'react';

export const useAssignableActionOptions = (currentAction?: KeybindCommand | null): ReadonlyArray<ActionOption> => {
	const {i18n} = useLingui();
	return useMemo(() => {
		const defaults = Keybind.getDefaults();
		return buildAssignableActionOptions(i18n, defaults, currentAction);
	}, [currentAction, i18n.locale]);
};
