// SPDX-License-Identifier: AGPL-3.0-or-later

import {APIErrorCodes} from '@fluxer/constants/src/ApiErrorCodes';
import {BadRequestError} from '@fluxer/errors/src/domains/core/BadRequestError';

export class InvalidPackTypeError extends BadRequestError {
	constructor(expectedType: 'emoji' | 'sticker') {
		super({
			code: APIErrorCodes.INVALID_PACK_TYPE,
			messageVariables: {expectedType},
		});
	}
}
