// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0
export interface ReconnectPolicy {
	nextRetryDelayInMs(context: ReconnectContext): number | null;
}

export interface ReconnectContext {
	readonly retryCount: number;

	readonly elapsedMs: number;

	readonly retryReason?: Error;

	readonly serverUrl?: string;
}
