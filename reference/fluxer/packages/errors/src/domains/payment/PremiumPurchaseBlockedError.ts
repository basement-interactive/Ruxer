// SPDX-License-Identifier: AGPL-3.0-or-later

import {APIErrorCodes} from '@fluxer/constants/src/ApiErrorCodes';
import {ForbiddenError} from '@fluxer/errors/src/domains/core/ForbiddenError';
import type {FluxerErrorData} from '@fluxer/errors/src/FluxerError';

type PremiumPurchaseBlockedReason = 'lifetime' | 'existing_subscription' | 'purchase_disabled';

export class PremiumPurchaseBlockedError extends ForbiddenError {
	constructor(reason: PremiumPurchaseBlockedReason = 'purchase_disabled', data: FluxerErrorData = {}) {
		super({
			code: APIErrorCodes.PREMIUM_PURCHASE_BLOCKED,
			data: {
				...data,
				reason,
			},
		});
	}
}
