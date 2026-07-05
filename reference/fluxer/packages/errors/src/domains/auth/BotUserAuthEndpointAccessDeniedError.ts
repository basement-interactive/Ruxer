// SPDX-License-Identifier: AGPL-3.0-or-later

import {APIErrorCodes} from '@fluxer/constants/src/ApiErrorCodes';
import {ForbiddenError} from '@fluxer/errors/src/domains/core/ForbiddenError';

export class BotUserAuthEndpointAccessDeniedError extends ForbiddenError {
	constructor() {
		super({
			code: APIErrorCodes.BOT_USER_AUTH_ENDPOINT_ACCESS_DENIED,
		});
	}
}
