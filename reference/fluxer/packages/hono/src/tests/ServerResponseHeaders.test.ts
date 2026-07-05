// SPDX-License-Identifier: AGPL-3.0-or-later

import {request as httpRequest} from 'node:http';
import {createServer} from '@fluxer/hono/src/Server';
import type {ServerType} from '@hono/node-server';
import {Hono} from 'hono';
import {afterEach, describe, expect, test} from 'vitest';

function countRawHeader(rawHeaders: Array<string>, headerName: string): number {
	let count = 0;
	for (let index = 0; index < rawHeaders.length; index += 2) {
		const name = rawHeaders[index];
		if (name?.toLowerCase() === headerName.toLowerCase()) {
			count += 1;
		}
	}
	return count;
}

function requestRawHeaders(
	port: number,
	path: string,
): Promise<{
	statusCode: number;
	rawHeaders: Array<string>;
}> {
	return new Promise((resolve, reject) => {
		const req = httpRequest(
			{
				host: '127.0.0.1',
				method: 'GET',
				path,
				port,
			},
			(res) => {
				const rawHeaders = res.rawHeaders;
				res.resume();
				res.on('end', () => {
					resolve({statusCode: res.statusCode ?? 0, rawHeaders});
				});
			},
		);
		req.on('error', reject);
		req.end();
	});
}

function closeServer(server: ServerType): Promise<void> {
	return new Promise((resolve, reject) => {
		server.close((error?: Error) => {
			if (error) {
				reject(error);
				return;
			}
			resolve();
		});
	});
}

describe('Server response headers', () => {
	let server: ServerType | null = null;
	afterEach(async () => {
		if (server) {
			await closeServer(server);
			server = null;
		}
	});
	test('does not emit duplicate content-length headers for partial content responses', async () => {
		const app = new Hono();
		app.get('/range', (ctx) => {
			ctx.status(206);
			ctx.header('Content-Range', 'bytes 0-3/4');
			ctx.header('Content-Length', '4');
			return ctx.body(new Uint8Array([1, 2, 3, 4]));
		});
		const port = await new Promise<number>((resolve) => {
			server = createServer(app, {
				onListen: ({port: listeningPort}) => resolve(listeningPort),
				port: 0,
			});
		});
		const response = await requestRawHeaders(port, '/range');
		expect(response.statusCode).toBe(206);
		expect(countRawHeader(response.rawHeaders, 'content-length')).toBe(1);
	});
});
