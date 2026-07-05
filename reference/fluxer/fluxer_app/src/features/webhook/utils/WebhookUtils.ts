// SPDX-License-Identifier: AGPL-3.0-or-later

import {adjectives, animals, uniqueNamesGenerator} from 'unique-names-generator';

export function generateWebhookName(): string {
	return uniqueNamesGenerator({
		dictionaries: [adjectives, animals],
		separator: ' ',
		style: 'capital',
		length: 2,
	});
}
