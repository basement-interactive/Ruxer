// SPDX-License-Identifier: AGPL-3.0-or-later

import {APIErrorCodes} from '@fluxer/constants/src/ApiErrorCodes';
import {ForbiddenError} from '@fluxer/errors/src/domains/core/ForbiddenError';

export class MissingOAuthScopeError extends ForbiddenError {
	constructor(scope: string) {
		super({
			code: APIErrorCodes.MISSING_OAUTH_SCOPE,
			message: `Missing required OAuth2 scope: ${scope}`,
			data: {required_scope: scope},
		});
	}
}
