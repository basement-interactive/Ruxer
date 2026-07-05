// SPDX-License-Identifier: AGPL-3.0-or-later

import {buildEndpointUrl, validateOutboundEndpointUrl} from '@fluxer/hono/src/security/OutboundEndpoint';
import {describe, expect, test} from 'vitest';

describe('OutboundEndpoint', () => {
	test('validates and normalises a safe endpoint', () => {
		const endpoint = validateOutboundEndpointUrl('https://api.example.com/v1', {
			name: 'test.endpoint',
			allowHttp: false,
			allowLocalhost: false,
			allowPrivateIpLiterals: false,
		});
		expect(buildEndpointUrl(endpoint, '/users/@me')).toBe('https://api.example.com/v1/users/@me');
	});
	test('rejects localhost when not allowed', () => {
		expect(() =>
			validateOutboundEndpointUrl('http://localhost:8088', {
				name: 'test.endpoint',
				allowHttp: true,
				allowLocalhost: false,
				allowPrivateIpLiterals: true,
			}),
		).toThrow('cannot use localhost');
	});
	test('rejects private IP literals when not allowed', () => {
		expect(() =>
			validateOutboundEndpointUrl('http://192.168.1.8:8080', {
				name: 'test.endpoint',
				allowHttp: true,
				allowLocalhost: true,
				allowPrivateIpLiterals: false,
			}),
		).toThrow('private or special IP literals');
	});
	test('rejects absolute outbound paths', () => {
		const endpoint = validateOutboundEndpointUrl('https://api.example.com', {
			name: 'test.endpoint',
			allowHttp: false,
			allowLocalhost: false,
			allowPrivateIpLiterals: false,
		});
		expect(() => buildEndpointUrl(endpoint, 'https://evil.example.com')).toThrow('Outbound path must be relative');
	});
});
