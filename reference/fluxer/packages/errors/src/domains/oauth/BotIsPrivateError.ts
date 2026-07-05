// SPDX-License-Identifier: AGPL-3.0-or-later

import {APIErrorCodes} from '@fluxer/constants/src/ApiErrorCodes';
import {ForbiddenError} from '@fluxer/errors/src/domains/core/ForbiddenError';

export class BotIsPrivateError extends ForbiddenError {
	constructor(messageVariables?: Record<string, unknown>) {
		super({
			code: APIErrorCodes.BOT_IS_PRIVATE,
			messageVariables,
		});
	}
}
