// SPDX-License-Identifier: AGPL-3.0-or-later

export class ScreenRecordingPermissionDeniedError extends Error {
	displayName = 'ScreenRecordingPermissionDeniedError';

	constructor() {
		super('Screen recording permission denied');
		this.name = 'ScreenRecordingPermissionDeniedError';
	}
}
