// @vitest-environment happy-dom
// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	clearPointerActivationFocusTargetForTests,
	getActivatableFocusTarget,
	recordPointerActivationFocusTarget,
	shouldRestoreFocusToTarget,
} from '@app/features/ui/utils/PointerActivationFocus';
import {afterEach, describe, expect, it} from 'vitest';

describe('PointerActivationFocus', () => {
	afterEach(() => {
		document.body.replaceChildren();
		clearPointerActivationFocusTargetForTests();
	});

	it('finds the nearest native or ARIA button from a child event target', () => {
		const button = document.createElement('button');
		const icon = document.createElement('span');
		button.append(icon);
		document.body.append(button);

		const ariaButton = document.createElement('div');
		ariaButton.setAttribute('role', 'button');
		const label = document.createElement('span');
		ariaButton.append(label);
		document.body.append(ariaButton);

		expect(getActivatableFocusTarget(icon)).toBe(button);
		expect(getActivatableFocusTarget(label)).toBe(ariaButton);
		expect(getActivatableFocusTarget(document.body)).toBeNull();
	});

	it('suppresses focus restoration to a pointer-activated control in pointer mode', () => {
		const button = document.createElement('button');
		document.body.append(button);

		recordPointerActivationFocusTarget(button);

		expect(shouldRestoreFocusToTarget(button, false)).toBe(false);
		expect(shouldRestoreFocusToTarget(button, true)).toBe(true);
	});

	it('allows focus restoration to unrelated targets and after the pointer target is cleared', () => {
		const button = document.createElement('button');
		const textarea = document.createElement('textarea');
		document.body.append(button, textarea);

		recordPointerActivationFocusTarget(button);
		expect(shouldRestoreFocusToTarget(textarea, false)).toBe(true);

		recordPointerActivationFocusTarget(null);
		expect(shouldRestoreFocusToTarget(button, false)).toBe(true);
	});

	it('suppresses restoration when the trigger wraps the pointer-activated button', () => {
		const wrapper = document.createElement('div');
		const button = document.createElement('button');
		wrapper.append(button);
		document.body.append(wrapper);

		recordPointerActivationFocusTarget(button);

		expect(shouldRestoreFocusToTarget(wrapper, false)).toBe(false);
		expect(shouldRestoreFocusToTarget(wrapper, true)).toBe(true);
	});

	it('suppresses restoration when the pointer-activated control wraps the trigger target', () => {
		const button = document.createElement('button');
		const inner = document.createElement('span');
		button.append(inner);
		document.body.append(button);

		recordPointerActivationFocusTarget(button);

		expect(shouldRestoreFocusToTarget(inner, false)).toBe(false);
	});
});
