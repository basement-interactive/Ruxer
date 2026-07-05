// SPDX-License-Identifier: AGPL-3.0-or-later

import {APIErrorCodes} from '@fluxer/constants/src/ApiErrorCodes';
import {ForbiddenError} from '@fluxer/errors/src/domains/core/ForbiddenError';

export class RegistrationPendingApprovalError extends ForbiddenError {
	constructor() {
		super({code: APIErrorCodes.REGISTRATION_PENDING_APPROVAL});
		this.name = 'RegistrationPendingApprovalError';
	}
}
