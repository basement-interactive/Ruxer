// SPDX-License-Identifier: AGPL-3.0-or-later

import {getWorkerFetchRoute} from '@app/features/platform/service_worker/WorkerFetchRouting';
import {describe, expect, it} from 'vitest';

const WORKER_ORIGIN = 'https://app.fluxer.test';

function request(url: string, init?: RequestInit): Request {
	return new Request(url, init);
}

describe('WorkerFetchRouting', () => {
	it('does not intercept expression media URLs', () => {
		expect(getWorkerFetchRoute(request('https://fluxerusercontent.com/emojis/123.webp'), WORKER_ORIGIN)).toBe('ignore');
		expect(getWorkerFetchRoute(request('https://fluxerusercontent.com/stickers/456.webp'), WORKER_ORIGIN)).toBe(
			'ignore',
		);
		expect(getWorkerFetchRoute(request(`${WORKER_ORIGIN}/emojis/123.webp`), WORKER_ORIGIN)).toBe('ignore');
		expect(getWorkerFetchRoute(request(`${WORKER_ORIGIN}/stickers/456.webp`), WORKER_ORIGIN)).toBe('ignore');
	});

	it('keeps app-owned runtime routes explicit', () => {
		expect(
			getWorkerFetchRoute(request(`${WORKER_ORIGIN}/channels/@me`, {headers: {accept: 'text/html'}}), WORKER_ORIGIN),
		).toBe('navigation');
		expect(
			getWorkerFetchRoute(request(`${WORKER_ORIGIN}/admin`, {headers: {accept: 'text/html'}}), WORKER_ORIGIN),
		).toBe('ignore');
		expect(getWorkerFetchRoute(request(`${WORKER_ORIGIN}/assets/app.js`), WORKER_ORIGIN)).toBe('static-asset');
		expect(getWorkerFetchRoute(request(`${WORKER_ORIGIN}/manifest.json`), WORKER_ORIGIN)).toBe('metadata');
		expect(getWorkerFetchRoute(request(`${WORKER_ORIGIN}/version.json`), WORKER_ORIGIN)).toBe('metadata');
	});

	it('ignores non-GET requests', () => {
		expect(getWorkerFetchRoute(request(`${WORKER_ORIGIN}/version.json`, {method: 'POST'}), WORKER_ORIGIN)).toBe(
			'ignore',
		);
	});
});
