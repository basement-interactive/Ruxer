// SPDX-License-Identifier: AGPL-3.0-or-later

import {APIErrorCodes} from '@fluxer/constants/src/ApiErrorCodes';
import {BadRequestError} from '@fluxer/errors/src/domains/core/BadRequestError';

export class UnclaimedAccountCannotJoinOneOnOneVoiceCallsError extends BadRequestError {
	constructor() {
		super({code: APIErrorCodes.UNCLAIMED_ACCOUNT_CANNOT_JOIN_ONE_ON_ONE_VOICE_CALLS});
	}
}
