// SPDX-License-Identifier: AGPL-3.0-or-later

import {APIErrorCodes} from '@fluxer/constants/src/ApiErrorCodes';
import {LockedError} from '@fluxer/errors/src/domains/core/LockedError';

export class ResourceLockedError extends LockedError {
	constructor(detail?: string) {
		super({
			code: APIErrorCodes.GENERAL_ERROR,
			headers: {'Retry-After': '2'},
			messageVariables: detail ? {detail} : undefined,
		});
	}
}
