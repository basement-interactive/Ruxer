// SPDX-License-Identifier: AGPL-3.0-or-later

import type {APIErrorCode} from '@fluxer/constants/src/ApiErrorCodes';
import {APIErrorCodes} from '@fluxer/constants/src/ApiErrorCodes';
import {FluxerError, type FluxerErrorData} from '@fluxer/errors/src/FluxerError';

export class GatewayTimeoutError extends FluxerError {
	constructor({
		code = APIErrorCodes.GATEWAY_TIMEOUT,
		message,
		data,
		headers,
		messageVariables,
	}: {
		code?: APIErrorCode;
		message?: string;
		data?: FluxerErrorData;
		headers?: Record<string, string>;
		messageVariables?: Record<string, unknown>;
	} = {}) {
		super({code, message, status: 504, data, headers, messageVariables});
	}
}
