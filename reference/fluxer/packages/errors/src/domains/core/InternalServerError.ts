// SPDX-License-Identifier: AGPL-3.0-or-later

import type {APIErrorCode} from '@fluxer/constants/src/ApiErrorCodes';
import {FluxerError, type FluxerErrorData} from '@fluxer/errors/src/FluxerError';

export class InternalServerError extends FluxerError {
	constructor({
		code,
		data,
		headers,
		messageVariables,
	}: {
		code: APIErrorCode;
		data?: FluxerErrorData;
		headers?: Record<string, string>;
		messageVariables?: Record<string, unknown>;
	}) {
		super({code, status: 500, data, headers, messageVariables});
	}
}
