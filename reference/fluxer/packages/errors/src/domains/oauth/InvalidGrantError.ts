// SPDX-License-Identifier: AGPL-3.0-or-later

import {OAuth2Error} from '@fluxer/errors/src/domains/auth/OAuth2Error';

export class InvalidGrantError extends OAuth2Error {
	constructor(message = 'The provided authorization grant is invalid, expired, or revoked') {
		super({error: 'invalid_grant', errorDescription: message, status: 400});
	}
}
