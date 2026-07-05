// SPDX-License-Identifier: AGPL-3.0-or-later

import {APIErrorCodes} from '@fluxer/constants/src/ApiErrorCodes';
import {FluxerError} from '@fluxer/errors/src/FluxerError';

export class AccessDeniedError extends FluxerError {
	constructor() {
		super({code: APIErrorCodes.ACCESS_DENIED, status: 403});
	}
}
