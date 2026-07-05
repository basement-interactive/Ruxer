// SPDX-License-Identifier: AGPL-3.0-or-later

import {APIErrorCodes} from '@fluxer/constants/src/ApiErrorCodes';
import {FluxerError} from '@fluxer/errors/src/FluxerError';

export class AgeVerificationAlreadyVerifiedError extends FluxerError {
	constructor() {
		super({
			code: APIErrorCodes.AGE_VERIFICATION_ALREADY_VERIFIED,
			status: 400,
		});
	}
}
