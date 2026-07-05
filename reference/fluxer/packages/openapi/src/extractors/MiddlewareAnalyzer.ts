// SPDX-License-Identifier: AGPL-3.0-or-later
import type {ExtractedRoute} from '@fluxer/openapi/src/Types';

interface SecurityRequirement {
	type: 'bearer' | 'none';
	scopes?: Array<string>;
	description?: string;
}
export function analyzeSecurityRequirements(route: ExtractedRoute): SecurityRequirement {
	if (route.hasLoginRequired || route.hasLoginRequiredAllowSuspicious || route.hasDefaultUserOnly) {
		return {
			type: 'bearer',
			description: route.hasDefaultUserOnly
				? 'Requires authentication (user accounts only, no bots)'
				: route.hasLoginRequiredAllowSuspicious
					? 'Requires authentication (allows accounts with suspicious activity flags)'
					: 'Requires authentication',
		};
	}
	return {type: 'none'};
}
