// SPDX-License-Identifier: AGPL-3.0-or-later

import {CSRF_HEADER_NAME} from '@fluxer/constants/src/Cookies';
import {createCsrfProtection} from '@fluxer/hono/src/security/CsrfProtection';
import {Hono} from 'hono';
import {describe, expect, test} from 'vitest';

describe('CsrfProtection', () => {
	test('accepts form token for mutating request', async () => {
		const app = new Hono();
		const protection = createCsrfProtection({
			secretKeyBase: 'test-secret',
			secureCookie: false,
		});
		app.use('*', protection.middleware);
		app.get('/form', (c) => c.json({token: protection.getToken(c)}));
		app.post('/submit', async (c) => {
			const body = await c.req.parseBody();
			return c.text(typeof body['locale'] === 'string' ? body['locale'] : 'missing');
		});
		const formResponse = await app.request('/form');
		expect(formResponse.status).toBe(200);
		const setCookie = formResponse.headers.get('set-cookie');
		expect(setCookie).toBeTruthy();
		const cookieHeader = setCookie?.split(';')[0] ?? '';
		const body = (await formResponse.json()) as {
			token: string;
		};
		const submitResponse = await app.request('/submit', {
			method: 'POST',
			headers: {
				'content-type': 'application/x-www-form-urlencoded',
				cookie: cookieHeader,
			},
			body: `_csrf=${encodeURIComponent(body.token)}&locale=en-US`,
		});
		expect(submitResponse.status).toBe(200);
		expect(await submitResponse.text()).toBe('en-US');
	});
	test('rejects mutating request without submitted token', async () => {
		const app = new Hono();
		const protection = createCsrfProtection({
			secretKeyBase: 'test-secret',
			secureCookie: false,
		});
		app.use('*', protection.middleware);
		app.get('/form', (c) => c.json({token: protection.getToken(c)}));
		app.post('/submit', (c) => c.text('ok'));
		const formResponse = await app.request('/form');
		const setCookie = formResponse.headers.get('set-cookie') ?? '';
		const cookieHeader = setCookie.split(';')[0] ?? '';
		const submitResponse = await app.request('/submit', {
			method: 'POST',
			headers: {
				cookie: cookieHeader,
			},
			body: JSON.stringify({x: 1}),
		});
		expect(submitResponse.status).toBe(403);
	});
	test('accepts header token for json requests', async () => {
		const app = new Hono();
		const protection = createCsrfProtection({
			secretKeyBase: 'test-secret',
			secureCookie: false,
		});
		app.use('*', protection.middleware);
		app.get('/form', (c) => c.json({token: protection.getToken(c)}));
		app.post('/submit', (c) => c.text('ok'));
		const formResponse = await app.request('/form');
		const setCookie = formResponse.headers.get('set-cookie') ?? '';
		const cookieHeader = setCookie.split(';')[0] ?? '';
		const body = (await formResponse.json()) as {
			token: string;
		};
		const submitResponse = await app.request('/submit', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				cookie: cookieHeader,
				[CSRF_HEADER_NAME]: body.token,
			},
			body: JSON.stringify({x: 1}),
		});
		expect(submitResponse.status).toBe(200);
	});
});
