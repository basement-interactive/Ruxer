// SPDX-License-Identifier: AGPL-3.0-or-later

import {APIErrorCodes} from '@fluxer/constants/src/ApiErrorCodes';
import {FluxerError} from '@fluxer/errors/src/FluxerError';

export class StripePaymentNotAvailableError extends FluxerError {
	constructor() {
		super({
			code: APIErrorCodes.STRIPE_PAYMENT_NOT_AVAILABLE,
			status: 400,
		});
	}
}
