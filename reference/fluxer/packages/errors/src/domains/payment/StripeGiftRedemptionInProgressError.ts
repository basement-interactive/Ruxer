// SPDX-License-Identifier: AGPL-3.0-or-later

import {APIErrorCodes} from '@fluxer/constants/src/ApiErrorCodes';
import {FluxerError} from '@fluxer/errors/src/FluxerError';

export class StripeGiftRedemptionInProgressError extends FluxerError {
	constructor() {
		super({
			code: APIErrorCodes.STRIPE_GIFT_REDEMPTION_IN_PROGRESS,
			status: 400,
		});
	}
}
