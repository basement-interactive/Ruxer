// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0
import log from '../../logger.ts';
import {isLocalTrack} from '../utils.ts';
import type LocalTrack from './LocalTrack.ts';
import type {VideoCaptureOptions} from './options.ts';

type FacingMode = NonNullable<VideoCaptureOptions['facingMode']>;
type FacingModeFromLocalTrackOptions = {
	defaultFacingMode?: FacingMode;
};
type FacingModeFromLocalTrackReturnValue = {
	facingMode: FacingMode;
	confidence: 'high' | 'medium' | 'low';
};

export function facingModeFromLocalTrack(
	localTrack: LocalTrack | MediaStreamTrack,
	options: FacingModeFromLocalTrackOptions = {},
): FacingModeFromLocalTrackReturnValue {
	const track = isLocalTrack(localTrack) ? localTrack.mediaStreamTrack : localTrack;
	const trackSettings = track.getSettings();
	let result: FacingModeFromLocalTrackReturnValue = {
		facingMode: options.defaultFacingMode ?? 'user',
		confidence: 'low',
	};

	if ('facingMode' in trackSettings) {
		const rawFacingMode = trackSettings.facingMode;
		log.trace('rawFacingMode', {rawFacingMode});
		if (rawFacingMode && typeof rawFacingMode === 'string' && isFacingModeValue(rawFacingMode)) {
			result = {facingMode: rawFacingMode, confidence: 'high'};
		}
	}

	if (['low', 'medium'].includes(result.confidence)) {
		log.trace(`Try to get facing mode from device label: (${track.label})`);
		const labelAnalysisResult = facingModeFromDeviceLabel(track.label);
		if (labelAnalysisResult !== undefined) {
			result = labelAnalysisResult;
		}
	}

	return result;
}

const knownDeviceLabels = new Map<string, FacingModeFromLocalTrackReturnValue>([
	['obs virtual camera', {facingMode: 'environment', confidence: 'medium'}],
]);
const knownDeviceLabelSections = new Map<string, FacingModeFromLocalTrackReturnValue>([
	['iphone', {facingMode: 'environment', confidence: 'medium'}],
	['ipad', {facingMode: 'environment', confidence: 'medium'}],
]);
export function facingModeFromDeviceLabel(deviceLabel: string): FacingModeFromLocalTrackReturnValue | undefined {
	const label = deviceLabel.trim().toLowerCase();
	if (label === '') {
		return undefined;
	}

	if (knownDeviceLabels.has(label)) {
		return knownDeviceLabels.get(label);
	}

	return Array.from(knownDeviceLabelSections.entries()).find(([section]) => label.includes(section))?.[1];
}

function isFacingModeValue(item: string): item is FacingMode {
	const allowedValues: Array<FacingMode> = ['user', 'environment', 'left', 'right'];
	return item === undefined || allowedValues.includes(item as FacingMode);
}
