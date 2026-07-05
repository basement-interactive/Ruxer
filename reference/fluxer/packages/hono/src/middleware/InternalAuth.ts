// SPDX-License-Identifier: AGPL-3.0-or-later

import {timingSafeEqual} from 'node:crypto';
import {UnauthorizedError} from '@fluxer/errors/src/domains/core/UnauthorizedError';
import {matchesAnyExactOrNestedPath} from '@fluxer/hono/src/middleware/utils/PathMatchers';
import type {MiddlewareHandler} from 'hono';

interface InternalAuthOptions {
	secret: string;
	skipPaths?: Array<string>;
}

function timingSafeCompare(a: string, b: string): boolean {
	const bufferA = Buffer.from(a);
	const bufferB = Buffer.from(b);
	if (bufferA.length !== bufferB.length) {
		return false;
	}
	return timingSafeEqual(bufferA, bufferB);
}

export function createInternalAuth(options: InternalAuthOptions): MiddlewareHandler {
	const {secret, skipPaths = ['/_health']} = options;
	return async (c, next) => {
		const path = c.req.path;
		if (matchesAnyExactOrNestedPath(path, skipPaths)) {
			await next();
			return;
		}
		const authHeader = c.req.header('Authorization');
		if (!authHeader) {
			throw new UnauthorizedError({message: 'Missing Authorization header'});
		}
		if (!authHeader.startsWith('Bearer ')) {
			throw new UnauthorizedError({message: 'Invalid Authorization header format'});
		}
		const token = authHeader.slice(7);
		if (!timingSafeCompare(token, secret)) {
			throw new UnauthorizedError({message: 'Invalid token'});
		}
		await next();
	};
}
