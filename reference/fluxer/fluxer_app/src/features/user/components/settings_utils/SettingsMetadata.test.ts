// SPDX-License-Identifier: AGPL-3.0-or-later

import {describe, expect, it} from 'vitest';
import {isSettingsItemNew} from './SettingsMetadata';

const NOW = new Date('2026-06-04T12:00:00.000Z');

describe('SettingsMetadata new badges', () => {
	it('does not mark settings without an addedAt timestamp as new', () => {
		expect(isSettingsItemNew({}, NOW)).toBe(false);
	});

	it('marks settings added within the freshness window as new', () => {
		expect(isSettingsItemNew({addedAt: '2026-06-03T00:00:00.000Z'}, NOW)).toBe(true);
	});

	it('stops marking settings as new after 30 days', () => {
		expect(isSettingsItemNew({addedAt: '2026-05-01T00:00:00.000Z'}, NOW)).toBe(false);
	});

	it('does not mark settings as new for accounts created after the setting was added', () => {
		expect(isSettingsItemNew({addedAt: '2026-06-03T00:00:00.000Z'}, NOW, new Date('2026-06-04T00:00:00.000Z'))).toBe(
			false,
		);
	});

	it('does not mark future timestamps as new', () => {
		expect(isSettingsItemNew({addedAt: '2026-06-05T00:00:00.000Z'}, NOW)).toBe(false);
	});
});
