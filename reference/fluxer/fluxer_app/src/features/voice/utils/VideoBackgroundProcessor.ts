// SPDX-License-Identifier: AGPL-3.0-or-later

import {Logger} from '@app/features/platform/utils/AppLogger';
import VoiceSettings from '@app/features/voice/state/VoiceSettings';
import {
	type CameraVideoProcessorOptions,
	createCameraVideoProcessor,
} from '@app/features/voice/utils/CameraVideoProcessor';
import type {LocalVideoTrack} from 'livekit-client';

const logger = new Logger('VideoBackgroundProcessor');

export interface BackgroundProcessorOptions {
	backgroundImageId?: string;
	backgroundImages?: Array<{
		id: string;
		createdAt: number;
	}>;
	mirrorCamera?: boolean;
}

export interface AppliedBackgroundProcessor {
	destroy: () => Promise<void>;
}

async function clearBackgroundProcessor(track: LocalVideoTrack): Promise<void> {
	if (!track.getProcessor()) {
		return;
	}
	await track.stopProcessor(false);
	logger.info('Cleared background processor');
}

async function applyCameraVideoProcessor(
	track: LocalVideoTrack,
	options: CameraVideoProcessorOptions,
	logLabel: string,
): Promise<AppliedBackgroundProcessor | null> {
	await clearBackgroundProcessor(track);
	const processor = createCameraVideoProcessor(options);
	await track.setProcessor(processor);
	logger.info(logLabel);
	return processor;
}

export async function applyCameraMirrorProcessor(
	track: LocalVideoTrack,
	mirrorCamera = VoiceSettings.getMirrorCamera(),
) {
	try {
		if (!mirrorCamera) {
			await clearBackgroundProcessor(track);
			logger.debug('No camera mirror processor applied');
			return null;
		}
		return applyCameraVideoProcessor(track, {mirror: true}, 'Applied camera mirror');
	} catch (error) {
		logger.warn('Failed to apply camera mirror processor', error);
		return null;
	}
}

export async function applyBackgroundProcessor(
	track: LocalVideoTrack,
	options?: BackgroundProcessorOptions,
): Promise<AppliedBackgroundProcessor | null> {
	try {
		const voiceSettings = VoiceSettings;
		const mirrorCamera = options?.mirrorCamera ?? voiceSettings.getMirrorCamera();
		if (!mirrorCamera) {
			await clearBackgroundProcessor(track);
			logger.debug('No camera video processor applied');
			return null;
		}
		return applyCameraVideoProcessor(track, {mirror: true}, 'Applied camera mirror');
	} catch (error) {
		logger.warn('Failed to apply camera video processor', error);
		return null;
	}
}
