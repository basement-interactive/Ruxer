// SPDX-License-Identifier: AGPL-3.0-or-later

import {HttpError} from '@app/features/platform/types/EndpointError';

interface ValidationFault {
	path: string;
	message: string;
}

export function replyCode(body: unknown): string | undefined {
	return readString(body, 'code');
}

export function replyMessage(body: unknown): string | undefined {
	return readString(body, 'message');
}

export function replyRetryAfter(body: unknown): number | undefined {
	return readNumber(body, 'retry_after');
}

export function failureCode(error: unknown): string | undefined {
	return replyCode(failureBody(error));
}

export function failureMessage(error: unknown): string | undefined {
	return replyMessage(failureBody(error));
}

export function failureRetryAfter(error: unknown): number | undefined {
	return replyRetryAfter(failureBody(error));
}

export function failureValidationErrors(error: unknown): ReadonlyArray<ValidationFault> | undefined {
	const body = failureBody(error);
	if (!isRecord(body)) return undefined;
	const errors = body.errors;
	return Array.isArray(errors) ? (errors as ReadonlyArray<ValidationFault>) : undefined;
}

function failureBody(error: unknown): unknown {
	return error instanceof HttpError ? error.body : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function readString(value: unknown, key: string): string | undefined {
	if (!isRecord(value)) return undefined;
	const found = value[key];
	return typeof found === 'string' ? found : undefined;
}

function readNumber(value: unknown, key: string): number | undefined {
	if (!isRecord(value)) return undefined;
	const found = value[key];
	return typeof found === 'number' ? found : undefined;
}
