// SPDX-License-Identifier: AGPL-3.0-or-later

import {APIErrorCodes} from '@fluxer/constants/src/ApiErrorCodes';
import {FluxerError, type FluxerErrorData} from '@fluxer/errors/src/FluxerError';

export class ServiceUnavailableError extends FluxerError {
	constructor({
		code = APIErrorCodes.SERVICE_UNAVAILABLE,
		message,
		data,
		headers,
		messageVariables,
	}: {
		code?: string;
		message?: string;
		data?: FluxerErrorData;
		headers?: Record<string, string>;
		messageVariables?: Record<string, unknown>;
	} = {}) {
		super({code, message, status: 503, data, headers, messageVariables});
	}
}
