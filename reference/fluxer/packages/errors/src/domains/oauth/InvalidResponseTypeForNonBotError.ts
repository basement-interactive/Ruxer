// SPDX-License-Identifier: AGPL-3.0-or-later

import {OAuth2Error} from '@fluxer/errors/src/domains/auth/OAuth2Error';

export class InvalidResponseTypeForNonBotError extends OAuth2Error {
	constructor(message = 'response_type must be code for non-bot scopes') {
		super({error: 'invalid_request', errorDescription: message, status: 400});
	}
}
