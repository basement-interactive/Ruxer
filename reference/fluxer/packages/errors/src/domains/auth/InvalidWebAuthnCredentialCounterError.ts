// SPDX-License-Identifier: AGPL-3.0-or-later

import {APIErrorCodes} from '@fluxer/constants/src/ApiErrorCodes';
import {BadRequestError} from '@fluxer/errors/src/domains/core/BadRequestError';

export class InvalidWebAuthnCredentialCounterError extends BadRequestError {
	constructor() {
		super({code: APIErrorCodes.INVALID_WEBAUTHN_CREDENTIAL_COUNTER});
	}
}
