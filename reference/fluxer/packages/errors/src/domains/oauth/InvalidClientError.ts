// SPDX-License-Identifier: AGPL-3.0-or-later

import {OAuth2Error} from '@fluxer/errors/src/domains/auth/OAuth2Error';

export class InvalidClientError extends OAuth2Error {
	constructor(message = 'Invalid client credentials') {
		super({error: 'invalid_client', errorDescription: message, status: 400});
	}
}
