// SPDX-License-Identifier: AGPL-3.0-or-later

import {APIErrorCodes} from '@fluxer/constants/src/ApiErrorCodes';
import {InternalServerError} from '@fluxer/errors/src/domains/core/InternalServerError';

export class DeletionFailedError extends InternalServerError {
	constructor(detail?: string) {
		super({
			code: APIErrorCodes.DELETION_FAILED,
			messageVariables: detail ? {detail} : undefined,
		});
	}
}
