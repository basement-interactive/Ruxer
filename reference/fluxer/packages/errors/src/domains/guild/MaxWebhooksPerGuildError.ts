// SPDX-License-Identifier: AGPL-3.0-or-later

import {APIErrorCodes} from '@fluxer/constants/src/ApiErrorCodes';
import {BadRequestError} from '@fluxer/errors/src/domains/core/BadRequestError';

export class MaxWebhooksPerGuildError extends BadRequestError {
	constructor(limit: number) {
		super({
			code: APIErrorCodes.MAX_WEBHOOKS_PER_GUILD,
			messageVariables: {count: limit},
			data: {
				max_webhooks_per_guild: limit,
			},
		});
	}
}
