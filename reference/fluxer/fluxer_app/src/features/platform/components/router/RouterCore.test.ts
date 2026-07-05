// SPDX-License-Identifier: AGPL-3.0-or-later

import {createRootRoute, createRoute} from '@app/features/platform/components/router/RouterBuilder';
import {createRouter} from '@app/features/platform/components/router/RouterCore';
import {createMemoryHistory} from '@app/features/platform/components/router/RouterHistory';
import {describe, expect, it} from 'vitest';

function createTestRouter(initialHref = 'http://localhost/') {
	const rootRoute = createRootRoute();
	const homeRoute = createRoute({id: 'home', path: '/'});
	const oauthRoute = createRoute({id: 'oauthAuthorize', path: '/oauth2/authorize'});
	const channelRoute = createRoute({id: 'channel', path: '/channels/:guildId/:channelId'});
	const notFoundRoute = createRoute({id: '__notFound', path: '/__notfound'});
	return createRouter({
		routes: rootRoute.addChildren([homeRoute, oauthRoute, channelRoute, notFoundRoute]).build(),
		history: createMemoryHistory(initialHref),
		notFoundRouteId: '__notFound',
	});
}

describe('RouterCore', () => {
	it('reports only real SPA routes as client-handled destinations', () => {
		const router = createTestRouter('http://localhost/login');

		expect(router.canHandle('/oauth2/authorize?client_id=1')).toBe(true);
		expect(router.canHandle('/channels/123/456')).toBe(true);
		expect(router.canHandle('/admin/auth/start')).toBe(false);
		expect(router.canHandle('/marketing')).toBe(false);
		expect(router.canHandle('https://example.com/oauth2/authorize')).toBe(false);

		router.destroy();
	});
});
