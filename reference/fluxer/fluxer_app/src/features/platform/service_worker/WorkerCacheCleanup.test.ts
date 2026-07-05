// SPDX-License-Identifier: AGPL-3.0-or-later

import {shouldDeleteWorkerCache} from '@app/features/platform/service_worker/WorkerCacheCleanup';
import {describe, expect, it} from 'vitest';

describe('WorkerCacheCleanup', () => {
	it('deletes legacy expression asset caches even though old asset caches are preserved', () => {
		const expectedCaches = new Set(['fluxer-precache-current', 'fluxer-assets-current', 'fluxer-navigation-current']);

		expect(shouldDeleteWorkerCache('fluxer-expression-assets', expectedCaches)).toBe(true);
		expect(shouldDeleteWorkerCache('fluxer-expression-assets-2026.604', expectedCaches)).toBe(true);
		expect(shouldDeleteWorkerCache('fluxer-assets-previous', expectedCaches)).toBe(false);
		expect(shouldDeleteWorkerCache('fluxer-precache-previous', expectedCaches)).toBe(true);
		expect(shouldDeleteWorkerCache('third-party-cache', expectedCaches)).toBe(false);
		expect(shouldDeleteWorkerCache('fluxer-precache-current', expectedCaches)).toBe(false);
	});
});
