// SPDX-License-Identifier: AGPL-3.0-or-later

import {APIErrorCodes} from '@fluxer/constants/src/ApiErrorCodes';
import {ForbiddenError} from '@fluxer/errors/src/domains/core/ForbiddenError';

export class IpAuthorizationRequiredError extends ForbiddenError {
	constructor({
		ticket,
		email,
		resendAvailableIn,
	}: {
		ticket: string;
		email: string;
		resendAvailableIn: number;
	}) {
		super({
			code: APIErrorCodes.IP_AUTHORIZATION_REQUIRED,
			data: {
				ip_authorization_required: true,
				ticket,
				email,
				resend_available_in: resendAvailableIn,
			},
		});
	}
}
