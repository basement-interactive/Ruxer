// SPDX-License-Identifier: AGPL-3.0-or-later

import {isAppNavigationPath} from '@app/features/platform/service_worker/WorkerNavigation';
import {describe, expect, it} from 'vitest';

describe('WorkerNavigation', () => {
	it('allows only SPA paths to use the service worker navigation fallback', () => {
		expect(isAppNavigationPath('/')).toBe(true);
		expect(isAppNavigationPath('/login')).toBe(true);
		expect(isAppNavigationPath('/oauth2/authorize')).toBe(true);
		expect(isAppNavigationPath('/channels/@me')).toBe(true);
		expect(isAppNavigationPath('/channels/123/456')).toBe(true);
		expect(isAppNavigationPath('/invite/example')).toBe(true);

		expect(isAppNavigationPath('/admin')).toBe(false);
		expect(isAppNavigationPath('/admin/auth/start')).toBe(false);
		expect(isAppNavigationPath('/marketing')).toBe(false);
		expect(isAppNavigationPath('/api/users/@me')).toBe(false);
		expect(isAppNavigationPath('/media/avatars/1.png')).toBe(false);
		expect(isAppNavigationPath('/unknown')).toBe(false);
	});
});
