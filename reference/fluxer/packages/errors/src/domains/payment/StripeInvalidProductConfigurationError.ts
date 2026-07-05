// SPDX-License-Identifier: AGPL-3.0-or-later

import {APIErrorCodes} from '@fluxer/constants/src/ApiErrorCodes';
import {FluxerError} from '@fluxer/errors/src/FluxerError';

export class StripeInvalidProductConfigurationError extends FluxerError {
	constructor() {
		super({
			code: APIErrorCodes.STRIPE_INVALID_PRODUCT_CONFIGURATION,
			status: 400,
		});
	}
}
