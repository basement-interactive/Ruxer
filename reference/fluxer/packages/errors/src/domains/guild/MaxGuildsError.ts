// SPDX-License-Identifier: AGPL-3.0-or-later

import {APIErrorCodes} from '@fluxer/constants/src/ApiErrorCodes';
import {BadRequestError} from '@fluxer/errors/src/domains/core/BadRequestError';

export class MaxGuildsError extends BadRequestError {
	constructor(limit: number) {
		super({
			code: APIErrorCodes.MAX_GUILDS,
			messageVariables: {count: limit},
		});
	}
}
