// SPDX-License-Identifier: AGPL-3.0-or-later

import type React from 'react';

export function isIMEComposing(
	event:
		| React.KeyboardEvent
		| KeyboardEvent
		| {
				nativeEvent?: KeyboardEvent;
				keyCode?: number;
				isComposing?: boolean;
		  },
): boolean {
	const native = 'nativeEvent' in event ? event.nativeEvent : (event as KeyboardEvent);
	if (native?.isComposing) return true;
	const keyCode = 'keyCode' in event && typeof event.keyCode === 'number' ? event.keyCode : native?.keyCode;
	return keyCode === 229;
}
