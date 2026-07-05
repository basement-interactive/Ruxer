// SPDX-License-Identifier: AGPL-3.0-or-later

import type {APIErrorCode} from '@fluxer/constants/src/ApiErrorCodes';
import {FluxerError, type FluxerErrorData} from '@fluxer/errors/src/FluxerError';

export class BadRequestError extends FluxerError {
	constructor({
		code,
		message,
		headers,
		data,
		messageVariables,
	}: {
		code: APIErrorCode;
		message?: string;
		data?: FluxerErrorData;
		headers?: Record<string, string>;
		messageVariables?: Record<string, unknown>;
	}) {
		super({code, message, status: 400, data, headers, messageVariables});
	}
}
