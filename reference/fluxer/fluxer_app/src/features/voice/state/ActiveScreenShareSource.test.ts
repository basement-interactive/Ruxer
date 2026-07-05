// SPDX-License-Identifier: AGPL-3.0-or-later

import {afterEach, describe, expect, it} from 'vitest';
import ActiveScreenShareSource from './ActiveScreenShareSource';

describe('ActiveScreenShareSource', () => {
	afterEach(() => {
		ActiveScreenShareSource.clear();
	});

	it('tracks and clears whether the selected source is a Fluxer-owned window', () => {
		ActiveScreenShareSource.setSourceId('window:42:0', {isOwnWindow: true});
		expect(ActiveScreenShareSource.getSourceId()).toBe('window:42:0');
		expect(ActiveScreenShareSource.isOwnWindow()).toBe(true);

		ActiveScreenShareSource.setSourceId('screen:1:0');
		expect(ActiveScreenShareSource.getSourceId()).toBe('screen:1:0');
		expect(ActiveScreenShareSource.isOwnWindow()).toBe(false);

		ActiveScreenShareSource.clear();
		expect(ActiveScreenShareSource.getSourceId()).toBeNull();
		expect(ActiveScreenShareSource.isOwnWindow()).toBe(false);
	});
});
