// SPDX-License-Identifier: AGPL-3.0-or-later

import {OAuth2Error} from '@fluxer/errors/src/domains/auth/OAuth2Error';

export class InvalidRedirectUriError extends OAuth2Error {
	constructor(message = 'Invalid redirect_uri') {
		super({error: 'invalid_request', errorDescription: message, status: 400});
	}
}
