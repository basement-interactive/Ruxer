// SPDX-License-Identifier: AGPL-3.0-or-later

export interface DomainConfig {
	base_domain: string;
	public_scheme: 'http' | 'https';
	internal_scheme: 'http' | 'https';
	public_port?: number;
	internal_port?: number;
	static_cdn_domain?: string;
	invite_domain?: string;
	gift_domain?: string;
}

export interface DerivedEndpoints {
	api: string;
	api_client: string;
	app: string;
	gateway: string;
	media: string;
	static_cdn: string;
	admin: string;
	marketing: string;
	invite: string;
	gift: string;
}

export function buildUrl(scheme: string, domain: string, port?: number, path?: string): string {
	const isStandardPort =
		(scheme === 'http' && port === 80) ||
		(scheme === 'https' && port === 443) ||
		(scheme === 'ws' && port === 80) ||
		(scheme === 'wss' && port === 443);
	const portPart = port && !isStandardPort ? `:${port}` : '';
	const pathPart = path || '';
	return `${scheme}://${domain}${portPart}${pathPart}`;
}

export function deriveDomain(
	endpointType:
		| 'api'
		| 'api_client'
		| 'app'
		| 'gateway'
		| 'media'
		| 'static_cdn'
		| 'admin'
		| 'marketing'
		| 'invite'
		| 'gift',
	config: DomainConfig,
): string {
	switch (endpointType) {
		case 'static_cdn':
			return config.static_cdn_domain || config.base_domain;
		case 'invite':
			return config.invite_domain || config.base_domain;
		case 'gift':
			return config.gift_domain || config.base_domain;
		default:
			return config.base_domain;
	}
}

export function deriveEndpointsFromDomain(config: DomainConfig): DerivedEndpoints {
	const {public_scheme, public_port} = config;
	const gatewayScheme = public_scheme === 'https' ? 'wss' : 'ws';
	return {
		api: buildUrl(public_scheme, deriveDomain('api', config), public_port, '/api'),
		api_client: buildUrl(public_scheme, deriveDomain('api_client', config), public_port, '/api'),
		app: buildUrl(public_scheme, deriveDomain('app', config), public_port),
		gateway: buildUrl(gatewayScheme, deriveDomain('gateway', config), public_port, '/gateway'),
		media: buildUrl(public_scheme, deriveDomain('media', config), public_port, '/media'),
		static_cdn: config.static_cdn_domain
			? buildUrl('https', deriveDomain('static_cdn', config), undefined)
			: buildUrl(public_scheme, deriveDomain('static_cdn', config), public_port),
		admin: buildUrl(public_scheme, deriveDomain('admin', config), public_port, '/admin'),
		marketing: buildUrl(public_scheme, deriveDomain('marketing', config), public_port, '/marketing'),
		invite: buildUrl(public_scheme, deriveDomain('invite', config), public_port, '/invite'),
		gift: buildUrl(public_scheme, deriveDomain('gift', config), public_port, '/gift'),
	};
}
