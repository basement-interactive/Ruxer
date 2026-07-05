// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0
import {RpcError as RpcError_Proto} from '@livekit/protocol';

export interface PerformRpcParams {
	destinationIdentity: string;
	method: string;
	payload: string;
	responseTimeout?: number;
}

export interface RpcInvocationData {
	requestId: string;

	callerIdentity: string;

	payload: string;

	responseTimeout: number;
}

export class RpcError extends Error {
	static MAX_MESSAGE_BYTES = 256;

	static MAX_DATA_BYTES = 15360;

	code: number;

	data?: string;

	constructor(code: number, message: string, data?: string) {
		super(message);
		this.code = code;
		this.message = truncateBytes(message, RpcError.MAX_MESSAGE_BYTES);
		this.data = data ? truncateBytes(data, RpcError.MAX_DATA_BYTES) : undefined;
	}

	static fromProto(proto: RpcError_Proto) {
		return new RpcError(proto.code, proto.message, proto.data);
	}

	toProto() {
		return new RpcError_Proto({
			code: this.code as number,
			message: this.message,
			data: this.data,
		});
	}

	static ErrorCode = {
		APPLICATION_ERROR: 1500,
		CONNECTION_TIMEOUT: 1501,
		RESPONSE_TIMEOUT: 1502,
		RECIPIENT_DISCONNECTED: 1503,
		RESPONSE_PAYLOAD_TOO_LARGE: 1504,
		SEND_FAILED: 1505,

		UNSUPPORTED_METHOD: 1400,
		RECIPIENT_NOT_FOUND: 1401,
		REQUEST_PAYLOAD_TOO_LARGE: 1402,
		UNSUPPORTED_SERVER: 1403,
		UNSUPPORTED_VERSION: 1404,
	} as const;

	static ErrorMessage: Record<keyof typeof RpcError.ErrorCode, string> = {
		APPLICATION_ERROR: 'Application error in method handler',
		CONNECTION_TIMEOUT: 'Connection timeout',
		RESPONSE_TIMEOUT: 'Response timeout',
		RECIPIENT_DISCONNECTED: 'Recipient disconnected',
		RESPONSE_PAYLOAD_TOO_LARGE: 'Response payload too large',
		SEND_FAILED: 'Failed to send',

		UNSUPPORTED_METHOD: 'Method not supported at destination',
		RECIPIENT_NOT_FOUND: 'Recipient not found',
		REQUEST_PAYLOAD_TOO_LARGE: 'Request payload too large',
		UNSUPPORTED_SERVER: 'RPC not supported by server',
		UNSUPPORTED_VERSION: 'Unsupported RPC version',
	} as const;

	static builtIn(key: keyof typeof RpcError.ErrorCode, data?: string): RpcError {
		return new RpcError(RpcError.ErrorCode[key], RpcError.ErrorMessage[key], data);
	}
}

export const MAX_PAYLOAD_BYTES = 15360;

export function byteLength(str: string): number {
	const encoder = new TextEncoder();
	return encoder.encode(str).length;
}

function truncateBytes(str: string, maxBytes: number): string {
	if (byteLength(str) <= maxBytes) {
		return str;
	}

	let low = 0;
	let high = str.length;
	const encoder = new TextEncoder();

	while (low < high) {
		const mid = Math.floor((low + high + 1) / 2);
		if (encoder.encode(str.slice(0, mid)).length <= maxBytes) {
			low = mid;
		} else {
			high = mid - 1;
		}
	}

	return str.slice(0, low);
}
