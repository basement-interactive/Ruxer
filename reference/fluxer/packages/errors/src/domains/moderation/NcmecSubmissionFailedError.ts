// SPDX-License-Identifier: AGPL-3.0-or-later

import {APIErrorCodes} from '@fluxer/constants/src/ApiErrorCodes';
import {InternalServerError} from '@fluxer/errors/src/domains/core/InternalServerError';

export class NcmecSubmissionFailedError extends InternalServerError {
	constructor(reason?: string) {
		super({
			code: APIErrorCodes.NCMEC_SUBMISSION_FAILED,
			...(reason != null && {data: {reason}}),
		});
	}
}
