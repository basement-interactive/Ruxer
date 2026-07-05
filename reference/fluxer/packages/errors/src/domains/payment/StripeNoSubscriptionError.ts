// SPDX-License-Identifier: AGPL-3.0-or-later

import {APIErrorCodes} from '@fluxer/constants/src/ApiErrorCodes';
import {FluxerError} from '@fluxer/errors/src/FluxerError';

export class StripeNoSubscriptionError extends FluxerError {
	constructor() {
		super({
			code: APIErrorCodes.STRIPE_NO_SUBSCRIPTION,
			status: 400,
		});
	}
}
