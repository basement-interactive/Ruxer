// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	createHoverStateSnapshot,
	getHoverStateValue,
	selectIsHovering,
	transitionHoverStateSnapshot,
} from '@app/features/app/hooks/HoverStateMachine';
import {describe, expect, it} from 'vitest';

describe('HoverStateMachine', () => {
	it('transitions between idle and hovering', () => {
		let snapshot = createHoverStateSnapshot();
		expect(getHoverStateValue(snapshot)).toBe('idle');
		expect(selectIsHovering(snapshot)).toBe(false);

		snapshot = transitionHoverStateSnapshot(snapshot, {type: 'hover.enter'});
		expect(getHoverStateValue(snapshot)).toBe('hovering');
		expect(selectIsHovering(snapshot)).toBe(true);

		snapshot = transitionHoverStateSnapshot(snapshot, {type: 'hover.leave'});
		expect(getHoverStateValue(snapshot)).toBe('idle');
		expect(selectIsHovering(snapshot)).toBe(false);
	});
});
