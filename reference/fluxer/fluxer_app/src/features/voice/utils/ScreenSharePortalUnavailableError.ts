// SPDX-License-Identifier: AGPL-3.0-or-later

export type ScreenSharePortalUnavailableReason = 'empty' | 'error';

export class ScreenSharePortalUnavailableError extends Error {
	readonly reason: ScreenSharePortalUnavailableReason;

	constructor(reason: ScreenSharePortalUnavailableReason, message?: string) {
		super(message ?? 'Wayland screen share portal returned no capturable source');
		this.name = 'ScreenSharePortalUnavailableError';
		this.reason = reason;
	}
}

export function isScreenSharePortalUnavailableError(error: unknown): error is ScreenSharePortalUnavailableError {
	return error instanceof ScreenSharePortalUnavailableError;
}
