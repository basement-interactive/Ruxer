// SPDX-License-Identifier: AGPL-3.0-or-later

import type {KeybindCommand} from '@app/features/input/state/InputKeybind';
import {Combobox} from '@app/features/ui/components/form/FormCombobox';
import {
	ACTION_DROPDOWN_MENU_MIN_WIDTH,
	type ActionOption,
	type ActionValue,
	UNASSIGNED,
} from '@app/features/user/components/modals/tabs/keybinds_tab/shared';
import type React from 'react';

export const ActionDropdown: React.FC<{
	value: KeybindCommand | null;
	options: ReadonlyArray<ActionOption>;
	onChange: (value: KeybindCommand | null) => void;
	ariaLabel: string;
}> = ({value, options, onChange, ariaLabel}) => {
	return (
		<Combobox<ActionValue>
			value={value ?? UNASSIGNED}
			options={options}
			onChange={(next) => onChange(next === UNASSIGNED ? null : next)}
			isSearchable={false}
			density="compact"
			menuMinWidth={ACTION_DROPDOWN_MENU_MIN_WIDTH}
			placeholder={ariaLabel}
			data-flx="user.keybinds-tab.action-dropdown.select.change"
		/>
	);
};
