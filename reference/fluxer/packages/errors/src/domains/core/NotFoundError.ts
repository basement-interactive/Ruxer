// SPDX-License-Identifier: AGPL-3.0-or-later

import type {APIErrorCode} from '@fluxer/constants/src/ApiErrorCodes';
import {FluxerError, type FluxerErrorData} from '@fluxer/errors/src/FluxerError';

export class NotFoundError extends FluxerError {
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
		super({code, message, status: 404, data, headers, messageVariables});
	}
}
