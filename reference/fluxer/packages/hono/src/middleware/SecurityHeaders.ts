// SPDX-License-Identifier: AGPL-3.0-or-later

import type {Context, MiddlewareHandler} from 'hono';

export const STRICT_TRANSPORT_SECURITY_PRELOAD = 'max-age=31536000; includeSubDomains; preload';
const REFERRER_POLICY_STRICT_ORIGIN_WHEN_CROSS_ORIGIN = 'strict-origin-when-cross-origin';
const X_CONTENT_TYPE_OPTIONS_NOSNIFF = 'nosniff';
const X_FRAME_OPTIONS_DENY = 'DENY';
export const LOCKED_DOWN_PERMISSIONS_POLICY = [
	'accelerometer=()',
	'camera=()',
	'geolocation=()',
	'gyroscope=()',
	'magnetometer=()',
	'microphone=()',
	'payment=()',
	'usb=()',
].join(', ');

interface SecurityHeadersOptions {
	contentSecurityPolicy?: string | ((ctx: Context) => string | undefined);
	permissionsPolicy?: string | false;
	referrerPolicy?: string | false;
	strictTransportSecurity?: string | false;
	xContentTypeOptions?: string | false;
	xFrameOptions?: string | false;
	overwrite?: boolean;
}

function resolveHeaderValue(
	value: string | ((ctx: Context) => string | undefined) | undefined,
	ctx: Context,
): string | undefined {
	return typeof value === 'function' ? value(ctx) : value;
}

function setHeader(headers: Headers, name: string, value: string | false | undefined, overwrite: boolean): void {
	if (value === false || value === undefined || value.length === 0) {
		return;
	}
	if (!overwrite && headers.has(name)) {
		return;
	}
	headers.set(name, value);
}

export function securityHeaders(options: SecurityHeadersOptions = {}): MiddlewareHandler {
	const overwrite = options.overwrite ?? false;
	return async (ctx, next) => {
		await next();
		const headers = ctx.res.headers;
		setHeader(
			headers,
			'Strict-Transport-Security',
			options.strictTransportSecurity ?? STRICT_TRANSPORT_SECURITY_PRELOAD,
			overwrite,
		);
		setHeader(
			headers,
			'X-Content-Type-Options',
			options.xContentTypeOptions ?? X_CONTENT_TYPE_OPTIONS_NOSNIFF,
			overwrite,
		);
		setHeader(headers, 'X-Frame-Options', options.xFrameOptions ?? X_FRAME_OPTIONS_DENY, overwrite);
		setHeader(
			headers,
			'Referrer-Policy',
			options.referrerPolicy ?? REFERRER_POLICY_STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
			overwrite,
		);
		setHeader(headers, 'Permissions-Policy', options.permissionsPolicy ?? LOCKED_DOWN_PERMISSIONS_POLICY, overwrite);
		setHeader(headers, 'Content-Security-Policy', resolveHeaderValue(options.contentSecurityPolicy, ctx), overwrite);
	};
}
