// SPDX-License-Identifier: AGPL-3.0-or-later

import {APIErrorCodes} from '@fluxer/constants/src/ApiErrorCodes';
import {UnauthorizedError} from '@fluxer/errors/src/domains/core/UnauthorizedError';

export class MissingGatewayAuthorizationError extends UnauthorizedError {
	constructor() {
		super({code: APIErrorCodes.MISSING_AUTHORIZATION});
	}
}
