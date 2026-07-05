// SPDX-License-Identifier: AGPL-3.0-or-later

import {DEFAULT_RESTRICTED_LIMITS, DEFAULT_STOCK_LIMITS} from '@fluxer/limits/src/LimitDefaults';

function simpleHash(str: string): string {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash = hash & hash;
	}
	return Math.abs(hash).toString(36);
}

export function computeDefaultsHash(): string {
	const combined = {
		free: DEFAULT_RESTRICTED_LIMITS,
		premium: DEFAULT_STOCK_LIMITS,
	};
	return simpleHash(JSON.stringify(combined));
}
