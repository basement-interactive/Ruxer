// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	canFocusTextarea,
	type FocusableElementType,
	isInputFocused,
	safeFocus,
} from '@app/features/platform/utils/InputFocusManager';
import {type RefObject, useCallback} from 'react';

export function useInputFocusManagement<T extends FocusableElementType>(textareaRef: RefObject<T | null>) {
	const safeFocusTextarea = useCallback(
		(force: boolean = false) => {
			if (!textareaRef.current) return false;
			return safeFocus(textareaRef.current, force);
		},
		[textareaRef],
	);
	const canFocus = useCallback(() => {
		if (!textareaRef.current) return false;
		return canFocusTextarea(textareaRef.current);
	}, [textareaRef]);
	const hasOtherInputFocused = useCallback(() => {
		return isInputFocused(textareaRef.current || undefined);
	}, [textareaRef]);
	return {
		safeFocusTextarea,
		canFocus,
		hasOtherInputFocused,
		isInputFocused: () => isInputFocused(textareaRef.current || undefined),
	};
}
