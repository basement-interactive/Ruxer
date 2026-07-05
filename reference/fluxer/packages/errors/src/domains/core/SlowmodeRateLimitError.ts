// SPDX-License-Identifier: AGPL-3.0-or-later

import {APIErrorCodes} from '@fluxer/constants/src/ApiErrorCodes';
import {BadRequestError} from '@fluxer/errors/src/domains/core/BadRequestError';

export class SlowmodeRateLimitError extends BadRequestError {
	constructor({
		retryAfter,
		retryAfterDecimal,
	}: {
		retryAfter: number;
		retryAfterDecimal?: number;
	}) {
		super({
			code: APIErrorCodes.SLOWMODE_RATE_LIMITED,
			data: {
				retry_after: retryAfterDecimal ?? retryAfter,
			},
			headers: {
				'Retry-After': retryAfter.toString(),
			},
		});
	}
}
