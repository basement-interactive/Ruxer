// SPDX-License-Identifier: AGPL-3.0-or-later

import {APIErrorCodes} from '@fluxer/constants/src/ApiErrorCodes';
import {BadRequestError} from '@fluxer/errors/src/domains/core/BadRequestError';

export class MaxFavoriteMemesError extends BadRequestError {
	constructor(limit: number) {
		super({
			code: APIErrorCodes.MAX_FAVORITE_MEMES,
			messageVariables: {count: limit},
			data: {
				max_favorite_memes: limit,
			},
		});
	}
}
