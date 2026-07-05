// SPDX-License-Identifier: AGPL-3.0-or-later

import {APIErrorCodes} from '@fluxer/constants/src/ApiErrorCodes';
import {FluxerError} from '@fluxer/errors/src/FluxerError';

export class StripeNoActiveSubscriptionError extends FluxerError {
	constructor() {
		super({
			code: APIErrorCodes.STRIPE_NO_ACTIVE_SUBSCRIPTION,
			status: 400,
		});
	}
}
