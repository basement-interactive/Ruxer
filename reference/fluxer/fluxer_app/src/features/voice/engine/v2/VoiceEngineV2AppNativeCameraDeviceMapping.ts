// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';
import type {VoiceEngineV2BridgeCameraDevice} from '@fluxer/voice_engine_v2';

const MAX_CAMERA_DEVICE_MAPPING_CANDIDATES = 64;
const MAX_CAMERA_DEVICE_MAPPING_ALIASES = 8;

export type VoiceEngineV2NativeCameraDeviceResolutionStatus =
	| 'default'
	| 'direct'
	| 'mapped'
	| 'unmapped'
	| 'ambiguous'
	| 'unavailable';

export interface VoiceEngineV2NativeCameraDeviceResolution {
	status: VoiceEngineV2NativeCameraDeviceResolutionStatus;
	deviceId?: string;
	requestedDeviceId?: string;
	browserLabel?: string;
	nativeLabel?: string;
	nativeDeviceCount: number;
	matchCount: number;
}

export interface VoiceEngineV2NativeCameraDeviceMappingInput {
	requestedDeviceId?: string;
	browserDevices: ReadonlyArray<MediaDeviceInfo>;
	nativeDevices: ReadonlyArray<VoiceEngineV2BridgeCameraDevice>;
}

interface NativeCameraMatch {
	device: VoiceEngineV2BridgeCameraDevice;
	score: number;
}

function normalizeCameraDeviceText(value: string): string {
	assert.equal(typeof value, 'string', 'camera device text must be a string');
	return value
		.normalize('NFKD')
		.toLowerCase()
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

function nativeCameraDeviceMatchesId(device: VoiceEngineV2BridgeCameraDevice, deviceId: string): boolean {
	assert.ok(device !== null && typeof device === 'object', 'native camera device must be an object');
	assert.ok(deviceId.length > 0, 'native camera device id match requires a device id');
	if (device.deviceId === deviceId) return true;
	const aliases = device.deviceIdAliases ?? [];
	assert.ok(Array.isArray(aliases), 'native camera device aliases must be an array when present');
	const aliasCount = Math.min(aliases.length, MAX_CAMERA_DEVICE_MAPPING_ALIASES);
	for (let aliasIndex = 0; aliasIndex < aliasCount; aliasIndex += 1) {
		if (aliases[aliasIndex]?.trim() === deviceId) return true;
	}
	return false;
}

function cameraDeviceTextMatchScore(browserText: string, nativeText: string, score: number): number {
	assert.equal(typeof browserText, 'string', 'browser camera text must be a string');
	assert.equal(typeof nativeText, 'string', 'native camera text must be a string');
	assert.ok(score > 0, 'camera device match score must be positive');
	if (!browserText || !nativeText) return 0;
	if (browserText === nativeText) return score;
	if (browserText.includes(nativeText) || nativeText.includes(browserText)) return score - 10;
	return 0;
}

function scoreNativeCameraDevice(browserLabel: string, nativeDevice: VoiceEngineV2BridgeCameraDevice): number {
	assert.equal(typeof browserLabel, 'string', 'browser camera label must be a string');
	assert.ok(nativeDevice !== null && typeof nativeDevice === 'object', 'native camera device must be an object');
	const browserText = normalizeCameraDeviceText(browserLabel);
	const nativeLabel = normalizeCameraDeviceText(nativeDevice.label);
	const nativeDescription = normalizeCameraDeviceText(nativeDevice.description);
	const labelScore = cameraDeviceTextMatchScore(browserText, nativeLabel, 100);
	const descriptionScore = cameraDeviceTextMatchScore(browserText, nativeDescription, 90);
	return Math.max(labelScore, descriptionScore);
}

function findBrowserCameraDevice(devices: ReadonlyArray<MediaDeviceInfo>, deviceId: string): MediaDeviceInfo | null {
	assert.ok(Array.isArray(devices), 'browser camera devices must be an array');
	assert.ok(deviceId.length > 0, 'browser camera device lookup requires a device id');
	const deviceCount = Math.min(devices.length, MAX_CAMERA_DEVICE_MAPPING_CANDIDATES);
	for (let deviceIndex = 0; deviceIndex < deviceCount; deviceIndex += 1) {
		const device = devices[deviceIndex];
		if (device?.deviceId === deviceId) return device;
	}
	return null;
}

function findNativeCameraDevice(
	devices: ReadonlyArray<VoiceEngineV2BridgeCameraDevice>,
	deviceId: string,
): VoiceEngineV2BridgeCameraDevice | null {
	assert.ok(Array.isArray(devices), 'native camera devices must be an array');
	assert.ok(deviceId.length > 0, 'native camera device lookup requires a device id');
	const deviceCount = Math.min(devices.length, MAX_CAMERA_DEVICE_MAPPING_CANDIDATES);
	for (let deviceIndex = 0; deviceIndex < deviceCount; deviceIndex += 1) {
		const device = devices[deviceIndex];
		if (device && nativeCameraDeviceMatchesId(device, deviceId)) return device;
	}
	return null;
}

function selectNativeCameraLabelMatch(
	browserLabel: string,
	devices: ReadonlyArray<VoiceEngineV2BridgeCameraDevice>,
): {match: NativeCameraMatch | null; ambiguous: boolean; matchCount: number} {
	assert.equal(typeof browserLabel, 'string', 'browser camera label must be a string');
	assert.ok(Array.isArray(devices), 'native camera devices must be an array');
	let best: NativeCameraMatch | null = null;
	let ambiguous = false;
	let matchCount = 0;
	const deviceCount = Math.min(devices.length, MAX_CAMERA_DEVICE_MAPPING_CANDIDATES);
	for (let deviceIndex = 0; deviceIndex < deviceCount; deviceIndex += 1) {
		const device = devices[deviceIndex];
		if (!device?.deviceId) continue;
		const score = scoreNativeCameraDevice(browserLabel, device);
		if (score <= 0) continue;
		matchCount += 1;
		if (best === null || score > best.score) {
			best = {device, score};
			ambiguous = false;
		} else if (score === best.score) {
			ambiguous = true;
		}
	}
	return {match: best, ambiguous, matchCount};
}

export function resolveVoiceEngineV2NativeCameraDeviceId(
	input: VoiceEngineV2NativeCameraDeviceMappingInput,
): VoiceEngineV2NativeCameraDeviceResolution {
	assert.ok(input !== null && typeof input === 'object', 'native camera device mapping input is required');
	assert.ok(Array.isArray(input.browserDevices), 'browser camera devices must be an array');
	assert.ok(Array.isArray(input.nativeDevices), 'native camera devices must be an array');
	const requestedDeviceId = input.requestedDeviceId?.trim();
	const nativeDeviceCount = Math.min(input.nativeDevices.length, MAX_CAMERA_DEVICE_MAPPING_CANDIDATES);
	if (!requestedDeviceId || requestedDeviceId === 'default') {
		return {status: 'default', nativeDeviceCount, matchCount: 0};
	}
	const directNativeDevice = findNativeCameraDevice(input.nativeDevices, requestedDeviceId);
	if (directNativeDevice) {
		return {
			status: 'direct',
			deviceId: directNativeDevice.deviceId,
			requestedDeviceId,
			nativeLabel: directNativeDevice.label,
			nativeDeviceCount,
			matchCount: 1,
		};
	}
	if (nativeDeviceCount === 0) {
		return {status: 'unavailable', requestedDeviceId, nativeDeviceCount, matchCount: 0};
	}
	assert.ok(nativeDeviceCount > 0, 'native camera label matching requires native devices');
	const browserDevice = findBrowserCameraDevice(input.browserDevices, requestedDeviceId);
	const browserLabel = browserDevice?.label.trim();
	if (!browserLabel) return {status: 'unmapped', requestedDeviceId, nativeDeviceCount, matchCount: 0};
	const {match, ambiguous, matchCount} = selectNativeCameraLabelMatch(browserLabel, input.nativeDevices);
	if (match === null) return {status: 'unmapped', requestedDeviceId, browserLabel, nativeDeviceCount, matchCount};
	if (ambiguous) return {status: 'ambiguous', requestedDeviceId, browserLabel, nativeDeviceCount, matchCount};
	return {
		status: 'mapped',
		deviceId: match.device.deviceId,
		requestedDeviceId,
		browserLabel,
		nativeLabel: match.device.label,
		nativeDeviceCount,
		matchCount,
	};
}
