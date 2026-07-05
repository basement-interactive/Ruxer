// SPDX-License-Identifier: AGPL-3.0-or-later

import {OAuth2Error} from '@fluxer/errors/src/domains/auth/OAuth2Error';

export class InvalidClientSecretError extends OAuth2Error {
	constructor(message = 'Invalid client_secret') {
		super({error: 'invalid_client', errorDescription: message, status: 400});
	}
}
