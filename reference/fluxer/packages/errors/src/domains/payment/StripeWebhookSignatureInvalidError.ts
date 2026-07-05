// SPDX-License-Identifier: AGPL-3.0-or-later

import {APIErrorCodes} from '@fluxer/constants/src/ApiErrorCodes';
import {FluxerError} from '@fluxer/errors/src/FluxerError';

export class StripeWebhookSignatureInvalidError extends FluxerError {
	constructor() {
		super({
			code: APIErrorCodes.STRIPE_WEBHOOK_SIGNATURE_INVALID,
			status: 401,
		});
	}
}
