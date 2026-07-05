// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';
import type {DeviceScreenShareCaptureOptions} from '@app/features/voice/engine/voice_screen_share_manager/shared';
import type {VideoCodec} from 'livekit-client';

export function isScreenShareVideoCodecValue(value: unknown): value is VideoCodec {
	return value === 'av1' || value === 'h265' || value === 'h264' || value === 'vp9' || value === 'vp8';
}

export function isUserCancelledOrPermissionDeniedError(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	if (error.name === 'AbortError') return true;
	if (error.name === 'NotAllowedError') return true;
	if (error.name === 'PermissionDeniedError') return true;
	return false;
}

export function getDeviceScreenSharePublishDimensions(options?: DeviceScreenShareCaptureOptions): {
	width: number;
	height: number;
	frameRate: number;
} {
	const dims = {
		width: options?.resolution?.width ?? 1280,
		height: options?.resolution?.height ?? 720,
		frameRate: options?.resolution?.frameRate ?? 30,
	};
	assert.ok(dims.width > 0, 'width must be > 0');
	assert.ok(dims.height > 0, 'height must be > 0');
	assert.ok(dims.frameRate > 0, 'frameRate must be > 0');
	return dims;
}
