// SPDX-License-Identifier: AGPL-3.0-or-later

import {APIErrorCodes} from '@fluxer/constants/src/ApiErrorCodes';
import {BadRequestError} from '@fluxer/errors/src/domains/core/BadRequestError';

export class MaxPackExpressionsError extends BadRequestError {
	constructor(maxExpressions: number) {
		super({
			code: APIErrorCodes.MAX_PACK_EXPRESSIONS,
			messageVariables: {count: maxExpressions},
			data: {
				max_expressions: maxExpressions,
			},
		});
	}
}
