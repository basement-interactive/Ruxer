// SPDX-License-Identifier: AGPL-3.0-or-later

import type {APIErrorCode} from '@fluxer/constants/src/ApiErrorCodes';
import {FluxerError, type FluxerErrorData} from '@fluxer/errors/src/FluxerError';

export class ConflictError extends FluxerError {
	constructor({
		code,
		message,
		data,
		headers,
		messageVariables,
	}: {
		code: APIErrorCode;
		message?: string;
		data?: FluxerErrorData;
		headers?: Record<string, string>;
		messageVariables?: Record<string, unknown>;
	}) {
		super({code, message, status: 409, data, headers, messageVariables});
	}
}
