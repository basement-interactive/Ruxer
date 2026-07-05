// SPDX-License-Identifier: AGPL-3.0-or-later

import {APIErrorCodes} from '@fluxer/constants/src/ApiErrorCodes';
import {ThrottledError} from '@fluxer/errors/src/domains/core/ThrottledError';

export class IpAuthorizationResendLimitExceededError extends ThrottledError {
	constructor() {
		super({code: APIErrorCodes.IP_AUTHORIZATION_RESEND_LIMIT_EXCEEDED});
	}
}
