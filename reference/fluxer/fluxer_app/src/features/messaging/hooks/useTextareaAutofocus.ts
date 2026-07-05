// SPDX-License-Identifier: AGPL-3.0-or-later

import {useInputFocusManagement} from '@app/features/app/hooks/useInputFocusManagement';
import {useEffect} from 'react';

export function useTextareaAutofocus(
	textareaRef: React.RefObject<HTMLTextAreaElement | null>,
	isMobile: boolean,
	enabled: boolean = true,
) {
	const {safeFocusTextarea, canFocus} = useInputFocusManagement(textareaRef);
	useEffect(() => {
		if (!enabled || isMobile || !textareaRef.current) {
			return;
		}
		const timer = setTimeout(() => {
			safeFocusTextarea();
		}, 100);
		return () => clearTimeout(timer);
	}, [enabled, isMobile, safeFocusTextarea]);
	return {
		shouldAutoFocus: enabled && !isMobile,
		canFocusTextarea: canFocus,
		manualFocus: safeFocusTextarea,
	};
}
