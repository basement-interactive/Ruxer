// SPDX-License-Identifier: AGPL-3.0-or-later

import {APIErrorCodes} from '@fluxer/constants/src/ApiErrorCodes';
import {BadRequestError} from '@fluxer/errors/src/domains/core/BadRequestError';

export class AclsMustBeNonEmptyError extends BadRequestError {
	constructor() {
		super({code: APIErrorCodes.ACLS_MUST_BE_NON_EMPTY});
	}
}
