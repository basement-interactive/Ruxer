// SPDX-License-Identifier: AGPL-3.0-or-later

import {APIErrorCodes} from '@fluxer/constants/src/ApiErrorCodes';
import {ForbiddenError} from '@fluxer/errors/src/domains/core/ForbiddenError';

export class GuildVerificationRequiredError extends ForbiddenError {
	constructor(detail?: string) {
		super({
			code: APIErrorCodes.GUILD_VERIFICATION_REQUIRED,
			messageVariables: detail ? {detail} : undefined,
		});
	}
}
