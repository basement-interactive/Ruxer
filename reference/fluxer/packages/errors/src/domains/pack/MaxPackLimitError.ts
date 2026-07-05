// SPDX-License-Identifier: AGPL-3.0-or-later

import {APIErrorCodes} from '@fluxer/constants/src/ApiErrorCodes';
import {BadRequestError} from '@fluxer/errors/src/domains/core/BadRequestError';

export class MaxPackLimitError extends BadRequestError {
	constructor(packType: 'emoji' | 'sticker', limit: number, action: 'create' | 'install') {
		super({
			code: APIErrorCodes.MAX_PACKS,
			messageVariables: {packType, count: limit, action},
			data: {
				pack_type: packType,
				limit,
				action,
			},
		});
	}
}
