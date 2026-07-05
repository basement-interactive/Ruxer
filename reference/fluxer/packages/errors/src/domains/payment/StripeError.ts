// SPDX-License-Identifier: AGPL-3.0-or-later

import {APIErrorCodes} from '@fluxer/constants/src/ApiErrorCodes';
import {FluxerError} from '@fluxer/errors/src/FluxerError';

export class StripeError extends FluxerError {
	constructor(detail?: string) {
		super({
			code: APIErrorCodes.STRIPE_ERROR,
			status: 400,
			data: detail ? {detail} : undefined,
			messageVariables: detail ? {detail} : undefined,
		});
	}
}
