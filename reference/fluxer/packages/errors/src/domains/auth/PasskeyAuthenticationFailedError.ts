// SPDX-License-Identifier: AGPL-3.0-or-later

import {APIErrorCodes} from '@fluxer/constants/src/ApiErrorCodes';
import {UnauthorizedError} from '@fluxer/errors/src/domains/core/UnauthorizedError';

export class PasskeyAuthenticationFailedError extends UnauthorizedError {
	constructor() {
		super({code: APIErrorCodes.PASSKEY_AUTHENTICATION_FAILED});
	}
}
