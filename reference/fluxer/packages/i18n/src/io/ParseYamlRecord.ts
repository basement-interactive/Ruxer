// SPDX-License-Identifier: AGPL-3.0-or-later

import {parse as parseYaml} from 'yaml';

export function parseYamlRecord(raw: string): Record<string, unknown> {
	const parsed = parseYaml(raw);
	if (typeof parsed === 'object' && parsed !== null) {
		return parsed as Record<string, unknown>;
	}
	return {};
}
