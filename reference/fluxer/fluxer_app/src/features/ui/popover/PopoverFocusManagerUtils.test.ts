// @vitest-environment happy-dom
// SPDX-License-Identifier: AGPL-3.0-or-later

import {getPopoutFocusManagerInsideElements} from '@app/features/ui/popover/PopoverFocusManagerUtils';
import {afterEach, describe, expect, it} from 'vitest';

describe('getPopoutFocusManagerInsideElements', () => {
	afterEach(() => {
		document.body.replaceChildren();
	});

	it('includes the popout reference so its focused ancestor is not aria-hidden', () => {
		const frame = document.createElement('div');
		const button = document.createElement('button');
		const nativeTitlebar = document.createElement('div');
		nativeTitlebar.setAttribute('data-native-titlebar', '');
		frame.append(button);
		document.body.append(frame, nativeTitlebar);

		expect(getPopoutFocusManagerInsideElements(button)).toEqual([button, nativeTitlebar]);
	});

	it('includes a distinct return-focus target', () => {
		const button = document.createElement('button');
		const textarea = document.createElement('textarea');
		document.body.append(button, textarea);

		expect(getPopoutFocusManagerInsideElements(button, textarea)).toEqual([button, textarea]);
	});

	it('deduplicates the reference and return-focus target', () => {
		const button = document.createElement('button');
		document.body.append(button);

		expect(getPopoutFocusManagerInsideElements(button, button)).toEqual([button]);
	});

	it('ignores disconnected elements', () => {
		const button = document.createElement('button');
		const textarea = document.createElement('textarea');

		expect(getPopoutFocusManagerInsideElements(button, textarea)).toEqual([]);
	});
});
