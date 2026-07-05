// SPDX-License-Identifier: AGPL-3.0-or-later

import {FluxerError, type FluxerErrorData} from '@fluxer/errors/src/FluxerError';

export class ThrottledError extends FluxerError {
	constructor({
		code,
		message,
		data,
		headers,
		messageVariables,
	}: {
		code: string;
		message?: string;
		data?: FluxerErrorData;
		headers?: Record<string, string>;
		messageVariables?: Record<string, unknown>;
	}) {
		super({code, message, status: 429, data, headers, messageVariables});
	}
}
