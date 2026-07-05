// SPDX-License-Identifier: AGPL-3.0-or-later

import {APIErrorCodes} from '@fluxer/constants/src/ApiErrorCodes';
import {ForbiddenError} from '@fluxer/errors/src/domains/core/ForbiddenError';

export class SsoRequiredError extends ForbiddenError {
	constructor() {
		super({code: APIErrorCodes.SSO_REQUIRED});
		this.name = 'SsoRequiredError';
	}
}
