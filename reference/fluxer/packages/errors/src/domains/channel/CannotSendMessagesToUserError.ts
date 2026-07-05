// SPDX-License-Identifier: AGPL-3.0-or-later

import {APIErrorCodes} from '@fluxer/constants/src/ApiErrorCodes';
import {BadRequestError} from '@fluxer/errors/src/domains/core/BadRequestError';

export class CannotSendMessagesToUserError extends BadRequestError {
	constructor() {
		super({code: APIErrorCodes.CANNOT_SEND_MESSAGES_TO_USER});
	}
}
