// SPDX-License-Identifier: AGPL-3.0-or-later

import {APIErrorCodes} from '@fluxer/constants/src/ApiErrorCodes';
import {BadRequestError} from '@fluxer/errors/src/domains/core/BadRequestError';

export class ExplicitContentCannotBeSentError extends BadRequestError {
	constructor(probability: number) {
		super({
			code: APIErrorCodes.EXPLICIT_CONTENT_CANNOT_BE_SENT,
			messageVariables: {
				probabilityPercent: (probability * 100).toFixed(1),
			},
			data: {probability},
		});
	}
}
