// SPDX-License-Identifier: AGPL-3.0-or-later

import type {RateLimitOptions, RateLimitResult, RateLimitService} from '@fluxer/hono/src/middleware/RateLimit';
import {rateLimit} from '@fluxer/hono/src/middleware/RateLimit';
import {Hono} from 'hono';
import {describe, expect, test, vi} from 'vitest';

const TEST_IP = '192.168.1.100';
const IP_HEADERS = {'x-forwarded-for': TEST_IP};

function createMockRateLimitService(result: Partial<RateLimitResult> = {}): RateLimitService {
	const defaultResult: RateLimitResult = {
		allowed: true,
		limit: 100,
		remaining: 99,
		resetTime: new Date(Date.now() + 60000),
		...result,
	};
	return {
		checkLimit: vi.fn().mockResolvedValue(defaultResult),
	};
}

function createAppWithRateLimit(options: RateLimitOptions = {}) {
	const app = new Hono();
	app.use('*', rateLimit({trustClientIpHeader: true, ...options}));
	return app;
}

describe('RateLimit Middleware', () => {
	describe('enabled option', () => {
		test('skips rate limiting when enabled is false', async () => {
			const service = createMockRateLimitService();
			const app = createAppWithRateLimit({enabled: false, service});
			app.get('/test', (c) => c.json({ok: true}));
			const response = await app.request('/test', {headers: IP_HEADERS});
			expect(response.status).toBe(200);
			expect(service.checkLimit).not.toHaveBeenCalled();
		});
		test('skips rate limiting when service is not provided', async () => {
			const app = createAppWithRateLimit({enabled: true, service: undefined});
			app.get('/test', (c) => c.json({ok: true}));
			const response = await app.request('/test', {headers: IP_HEADERS});
			expect(response.status).toBe(200);
		});
		test('applies rate limiting when enabled and service provided', async () => {
			const service = createMockRateLimitService();
			const app = createAppWithRateLimit({enabled: true, service});
			app.get('/test', (c) => c.json({ok: true}));
			await app.request('/test', {headers: IP_HEADERS});
			expect(service.checkLimit).toHaveBeenCalled();
		});
	});
	describe('skip paths', () => {
		test('skips default health paths', async () => {
			const service = createMockRateLimitService();
			const app = createAppWithRateLimit({service});
			app.get('/_health', (c) => c.json({ok: true}));
			app.get('/metrics', (c) => c.json({ok: true}));
			await app.request('/_health', {headers: IP_HEADERS});
			await app.request('/metrics', {headers: IP_HEADERS});
			expect(service.checkLimit).not.toHaveBeenCalled();
		});
		test('skips custom paths', async () => {
			const service = createMockRateLimitService();
			const app = createAppWithRateLimit({skipPaths: ['/public'], service});
			app.get('/public', (c) => c.json({ok: true}));
			await app.request('/public', {headers: IP_HEADERS});
			expect(service.checkLimit).not.toHaveBeenCalled();
		});
		test('skips paths with wildcard patterns', async () => {
			const service = createMockRateLimitService();
			const app = createAppWithRateLimit({skipPaths: ['/static/*'], service});
			app.get('/static/file.js', (c) => c.json({ok: true}));
			app.get('/static/images/logo.png', (c) => c.json({ok: true}));
			await app.request('/static/file.js', {headers: IP_HEADERS});
			await app.request('/static/images/logo.png', {headers: IP_HEADERS});
			expect(service.checkLimit).not.toHaveBeenCalled();
		});
		test('applies rate limit to non-skipped paths', async () => {
			const service = createMockRateLimitService();
			const app = createAppWithRateLimit({skipPaths: ['/public'], service});
			app.get('/api/users', (c) => c.json({ok: true}));
			await app.request('/api/users', {headers: IP_HEADERS});
			expect(service.checkLimit).toHaveBeenCalled();
		});
	});
	describe('unknown client IP', () => {
		test('skips rate limiting when client IP cannot be determined', async () => {
			const service = createMockRateLimitService();
			const app = new Hono();
			app.use('*', rateLimit({service, trustClientIpHeader: false}));
			app.get('/test', (c) => c.json({ok: true}));
			const response = await app.request('/test');
			expect(response.status).toBe(200);
			expect(service.checkLimit).not.toHaveBeenCalled();
		});
		test('skips rate limiting when IP header is missing and header trust is enabled', async () => {
			const service = createMockRateLimitService();
			const app = createAppWithRateLimit({service});
			app.get('/test', (c) => c.json({ok: true}));
			const response = await app.request('/test');
			expect(response.status).toBe(200);
			expect(service.checkLimit).not.toHaveBeenCalled();
		});
	});
	describe('rate limit headers', () => {
		test('sets X-RateLimit-Limit header', async () => {
			const service = createMockRateLimitService({limit: 100});
			const app = createAppWithRateLimit({service});
			app.get('/test', (c) => c.json({ok: true}));
			const response = await app.request('/test', {headers: IP_HEADERS});
			expect(response.headers.get('X-RateLimit-Limit')).toBe('100');
		});
		test('sets X-RateLimit-Remaining header', async () => {
			const service = createMockRateLimitService({remaining: 42});
			const app = createAppWithRateLimit({service});
			app.get('/test', (c) => c.json({ok: true}));
			const response = await app.request('/test', {headers: IP_HEADERS});
			expect(response.headers.get('X-RateLimit-Remaining')).toBe('42');
		});
		test('sets X-RateLimit-Reset header as unix timestamp', async () => {
			const resetTime = new Date(Date.now() + 60000);
			const service = createMockRateLimitService({resetTime});
			const app = createAppWithRateLimit({service});
			app.get('/test', (c) => c.json({ok: true}));
			const response = await app.request('/test', {headers: IP_HEADERS});
			const reset = response.headers.get('X-RateLimit-Reset');
			expect(reset).toBe(Math.floor(resetTime.getTime() / 1000).toString());
		});
	});
	describe('rate limit exceeded', () => {
		test('returns 429 when rate limit exceeded', async () => {
			const service = createMockRateLimitService({allowed: false, remaining: 0});
			const app = createAppWithRateLimit({service});
			app.get('/test', (c) => c.json({ok: true}));
			const response = await app.request('/test', {headers: IP_HEADERS});
			expect(response.status).toBe(429);
		});
		test('returns error message when rate limit exceeded', async () => {
			const service = createMockRateLimitService({allowed: false});
			const app = createAppWithRateLimit({service});
			app.get('/test', (c) => c.json({ok: true}));
			const response = await app.request('/test', {headers: IP_HEADERS});
			const body = (await response.json()) as {
				error: string;
				message: string;
			};
			expect(body.error).toBe('Too Many Requests');
			expect(body.message).toBe('Rate limit exceeded');
		});
		test('sets Retry-After header when retryAfter is provided', async () => {
			const service = createMockRateLimitService({allowed: false, retryAfter: 60});
			const app = createAppWithRateLimit({service});
			app.get('/test', (c) => c.json({ok: true}));
			const response = await app.request('/test', {headers: IP_HEADERS});
			expect(response.headers.get('Retry-After')).toBe('60');
		});
		test('includes retryAfter in response body', async () => {
			const service = createMockRateLimitService({allowed: false, retryAfter: 30});
			const app = createAppWithRateLimit({service});
			app.get('/test', (c) => c.json({ok: true}));
			const response = await app.request('/test', {headers: IP_HEADERS});
			const body = (await response.json()) as {
				retryAfter: number;
			};
			expect(body.retryAfter).toBe(30);
		});
		test('calls onLimitExceeded callback when provided', async () => {
			const onLimitExceeded = vi.fn();
			const service = createMockRateLimitService({allowed: false});
			const app = createAppWithRateLimit({service, onLimitExceeded});
			app.get('/api/test', (c) => c.json({ok: true}));
			await app.request('/api/test', {headers: IP_HEADERS});
			expect(onLimitExceeded).toHaveBeenCalledWith(TEST_IP, '/api/test');
		});
	});
	describe('key generation', () => {
		test('uses default key generator based on IP', async () => {
			const service = createMockRateLimitService();
			const app = createAppWithRateLimit({service});
			app.get('/test', (c) => c.json({ok: true}));
			await app.request('/test', {headers: IP_HEADERS});
			expect(service.checkLimit).toHaveBeenCalledWith(
				expect.objectContaining({
					identifier: TEST_IP,
				}),
			);
		});
		test('uses custom key generator when provided', async () => {
			const keyGenerator = vi.fn().mockReturnValue('custom-key');
			const service = createMockRateLimitService();
			const app = createAppWithRateLimit({service, keyGenerator});
			app.get('/test', (c) => c.json({ok: true}));
			await app.request('/test');
			expect(keyGenerator).toHaveBeenCalled();
			expect(service.checkLimit).toHaveBeenCalledWith(
				expect.objectContaining({
					identifier: 'custom-key',
				}),
			);
		});
		test('async key generator is supported', async () => {
			const keyGenerator = vi.fn().mockResolvedValue('async-key');
			const service = createMockRateLimitService();
			const app = createAppWithRateLimit({service, keyGenerator});
			app.get('/test', (c) => c.json({ok: true}));
			await app.request('/test');
			expect(service.checkLimit).toHaveBeenCalledWith(
				expect.objectContaining({
					identifier: 'async-key',
				}),
			);
		});
		test('skips rate limiting when custom key generator returns null', async () => {
			const keyGenerator = vi.fn().mockReturnValue(null);
			const service = createMockRateLimitService();
			const app = createAppWithRateLimit({service, keyGenerator});
			app.get('/test', (c) => c.json({ok: true}));
			const response = await app.request('/test');
			expect(response.status).toBe(200);
			expect(service.checkLimit).not.toHaveBeenCalled();
		});
	});
	describe('rate limit parameters', () => {
		test('passes maxAttempts to service', async () => {
			const service = createMockRateLimitService();
			const app = createAppWithRateLimit({service, maxAttempts: 50});
			app.get('/test', (c) => c.json({ok: true}));
			await app.request('/test', {headers: IP_HEADERS});
			expect(service.checkLimit).toHaveBeenCalledWith(
				expect.objectContaining({
					maxAttempts: 50,
				}),
			);
		});
		test('uses default maxAttempts of 100', async () => {
			const service = createMockRateLimitService();
			const app = createAppWithRateLimit({service});
			app.get('/test', (c) => c.json({ok: true}));
			await app.request('/test', {headers: IP_HEADERS});
			expect(service.checkLimit).toHaveBeenCalledWith(
				expect.objectContaining({
					maxAttempts: 100,
				}),
			);
		});
		test('passes windowMs to service', async () => {
			const service = createMockRateLimitService();
			const app = createAppWithRateLimit({service, windowMs: 30000});
			app.get('/test', (c) => c.json({ok: true}));
			await app.request('/test', {headers: IP_HEADERS});
			expect(service.checkLimit).toHaveBeenCalledWith(
				expect.objectContaining({
					windowMs: 30000,
				}),
			);
		});
		test('uses default windowMs of 60000', async () => {
			const service = createMockRateLimitService();
			const app = createAppWithRateLimit({service});
			app.get('/test', (c) => c.json({ok: true}));
			await app.request('/test', {headers: IP_HEADERS});
			expect(service.checkLimit).toHaveBeenCalledWith(
				expect.objectContaining({
					windowMs: 60000,
				}),
			);
		});
	});
	describe('allowed requests', () => {
		test('allows request and calls next when under limit', async () => {
			const service = createMockRateLimitService({allowed: true, remaining: 50});
			const app = createAppWithRateLimit({service});
			app.get('/test', (c) => c.json({ok: true}));
			const response = await app.request('/test', {headers: IP_HEADERS});
			expect(response.status).toBe(200);
			const body = (await response.json()) as {
				ok: boolean;
			};
			expect(body.ok).toBe(true);
		});
		test('sets rate limit headers even for allowed requests', async () => {
			const service = createMockRateLimitService({allowed: true, limit: 100, remaining: 75});
			const app = createAppWithRateLimit({service});
			app.get('/test', (c) => c.json({ok: true}));
			const response = await app.request('/test', {headers: IP_HEADERS});
			expect(response.headers.get('X-RateLimit-Limit')).toBe('100');
			expect(response.headers.get('X-RateLimit-Remaining')).toBe('75');
		});
	});
});
