// SPDX-License-Identifier: AGPL-3.0-or-later

import type {AutocompleteOption} from '@app/features/channel/components/Autocomplete';
import {isIMEComposing} from '@app/features/messaging/utils/IMECompositionUtils';
import {useCallback} from 'react';

export function useTextareaAutocompleteKeyboard({
	isAutocompleteAttached,
	autocompleteOptions,
	selectedIndex,
	setSelectedIndex,
	handleSelect,
}: {
	isAutocompleteAttached: boolean;
	autocompleteOptions: Array<AutocompleteOption>;
	selectedIndex: number;
	setSelectedIndex: React.Dispatch<React.SetStateAction<number>>;
	handleSelect: (option: AutocompleteOption) => void;
}) {
	const handleKeyDown = useCallback(
		(event: React.KeyboardEvent<HTMLTextAreaElement>) => {
			if (isIMEComposing(event)) {
				return;
			}
			if (!isAutocompleteAttached || !autocompleteOptions.length) {
				return;
			}
			if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
				event.preventDefault();
				setSelectedIndex((prevIndex) => {
					const newIndex = event.key === 'ArrowUp' ? prevIndex - 1 : prevIndex + 1;
					return (newIndex + autocompleteOptions.length) % autocompleteOptions.length;
				});
			} else if ((event.key === 'Tab' && !event.shiftKey) || event.key === 'Enter') {
				event.preventDefault();
				const selectedOption = autocompleteOptions[selectedIndex];
				if (selectedOption) {
					handleSelect(selectedOption);
				}
			}
		},
		[isAutocompleteAttached, autocompleteOptions, selectedIndex, setSelectedIndex, handleSelect],
	);
	return {handleKeyDown};
}
