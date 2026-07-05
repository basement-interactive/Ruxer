// SPDX-License-Identifier: AGPL-3.0-or-later

import {APIErrorCodes} from '@fluxer/constants/src/ApiErrorCodes';
import {ThrottledError} from '@fluxer/errors/src/domains/core/ThrottledError';

export class IpAuthorizationResendCooldownError extends ThrottledError {
	constructor(resendAvailableIn: number) {
		super({
			code: APIErrorCodes.IP_AUTHORIZATION_RESEND_COOLDOWN,
			data: {resend_available_in: resendAvailableIn},
		});
	}
}
