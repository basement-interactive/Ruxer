// SPDX-License-Identifier: AGPL-3.0-or-later

import type {HttpMethod} from '@app/features/platform/types/TransportTypes';

export interface HttpErrorDetail {
	method: HttpMethod;
	path: string;
	status: number;
	body?: unknown;
	rawText?: string;
	responseHeaders?: Record<string, string>;
}

export class HttpError extends Error {
	readonly method: HttpMethod;
	readonly path: string;
	readonly status: number;
	readonly body: unknown;
	readonly rawText?: string;
	readonly responseHeaders: Record<string, string>;

	constructor(detail: HttpErrorDetail) {
		super(`[${detail.status}] ${detail.method} ${redactNumericIds(detail.path)}`);
		this.name = 'HttpError';
		this.method = detail.method;
		this.path = detail.path;
		this.status = detail.status;
		this.body = detail.body;
		this.rawText = detail.rawText;
		this.responseHeaders = detail.responseHeaders ?? {};
	}
}

function redactNumericIds(path: string): string {
	return path.replace(/\/(\d{5,})/g, () => `/:id`);
}
