// SPDX-License-Identifier: AGPL-3.0-or-later

import type {VoiceEngineV2BridgeCameraDevice} from '@fluxer/voice_engine_v2';
import {describe, expect, it} from 'vitest';
import {resolveVoiceEngineV2NativeCameraDeviceId} from './VoiceEngineV2AppNativeCameraDeviceMapping';

function browserCamera(deviceId: string, label: string): MediaDeviceInfo {
	return {deviceId, label, kind: 'videoinput'} as MediaDeviceInfo;
}

function nativeCamera(
	deviceId: string,
	label: string,
	description = label,
	options: {index?: number; deviceIdAliases?: Array<string>} = {},
): VoiceEngineV2BridgeCameraDevice {
	return {deviceId, label, description, ...options};
}

describe('resolveVoiceEngineV2NativeCameraDeviceId', () => {
	it('keeps default camera selection on the native default route', () => {
		const result = resolveVoiceEngineV2NativeCameraDeviceId({
			requestedDeviceId: 'default',
			browserDevices: [browserCamera('browser-studio', 'Studio Display Camera')],
			nativeDevices: [nativeCamera('native-studio', 'Studio Display Camera')],
		});

		expect(result).toMatchObject({status: 'default'});
		expect(result.deviceId).toBeUndefined();
	});

	it('accepts native camera ids directly, including non-numeric ids', () => {
		expect(
			resolveVoiceEngineV2NativeCameraDeviceId({
				requestedDeviceId: 'native-studio',
				browserDevices: [browserCamera('browser-studio', 'Studio Display Camera')],
				nativeDevices: [nativeCamera('native-studio', 'Studio Display Camera')],
			}),
		).toMatchObject({status: 'direct', deviceId: 'native-studio'});
	});

	it('maps native camera aliases to the canonical native camera id', () => {
		expect(
			resolveVoiceEngineV2NativeCameraDeviceId({
				requestedDeviceId: '0',
				browserDevices: [],
				nativeDevices: [
					nativeCamera('native-studio', 'Studio Display Camera', 'Apple Studio Display Camera', {
						index: 0,
						deviceIdAliases: ['native-studio', '0'],
					}),
				],
			}),
		).toMatchObject({status: 'direct', deviceId: 'native-studio'});
	});

	it('reports unavailable for unresolvable ids when no native devices exist', () => {
		const result = resolveVoiceEngineV2NativeCameraDeviceId({
			requestedDeviceId: '1',
			browserDevices: [],
			nativeDevices: [],
		});

		expect(result).toMatchObject({status: 'unavailable', nativeDeviceCount: 0});
		expect(result.deviceId).toBeUndefined();
	});

	it('maps browser camera ids to native ids by exact camera label', () => {
		expect(
			resolveVoiceEngineV2NativeCameraDeviceId({
				requestedDeviceId: 'browser-studio',
				browserDevices: [browserCamera('browser-studio', 'Studio Display Camera')],
				nativeDevices: [nativeCamera('native-studio', 'Studio Display Camera')],
			}),
		).toMatchObject({
			status: 'mapped',
			deviceId: 'native-studio',
			browserLabel: 'Studio Display Camera',
			nativeLabel: 'Studio Display Camera',
		});
	});

	it('maps browser labels that include extra transport metadata', () => {
		expect(
			resolveVoiceEngineV2NativeCameraDeviceId({
				requestedDeviceId: 'browser-c920',
				browserDevices: [browserCamera('browser-c920', 'HD Pro Webcam C920 (046d:082d)')],
				nativeDevices: [nativeCamera('native-c920', 'HD Pro Webcam C920')],
			}),
		).toMatchObject({status: 'mapped', deviceId: 'native-c920'});
	});

	it('does not pick a native camera when the best label match is ambiguous', () => {
		const result = resolveVoiceEngineV2NativeCameraDeviceId({
			requestedDeviceId: 'browser-virtual',
			browserDevices: [browserCamera('browser-virtual', 'OBS Virtual Camera')],
			nativeDevices: [
				nativeCamera('native-obs-a', 'OBS Virtual Camera'),
				nativeCamera('native-obs-b', 'OBS Virtual Camera'),
			],
		});

		expect(result).toMatchObject({status: 'ambiguous', matchCount: 2});
		expect(result.deviceId).toBeUndefined();
	});

	it('reports unavailable when native camera enumeration returns no devices', () => {
		const result = resolveVoiceEngineV2NativeCameraDeviceId({
			requestedDeviceId: 'browser-studio',
			browserDevices: [browserCamera('browser-studio', 'Studio Display Camera')],
			nativeDevices: [],
		});

		expect(result).toMatchObject({status: 'unavailable', nativeDeviceCount: 0, matchCount: 0});
		expect(result.deviceId).toBeUndefined();
	});

	it('returns unmapped when Chromium has not exposed a camera label', () => {
		const result = resolveVoiceEngineV2NativeCameraDeviceId({
			requestedDeviceId: 'browser-redacted',
			browserDevices: [browserCamera('browser-redacted', '')],
			nativeDevices: [nativeCamera('native-studio', 'Studio Display Camera')],
		});

		expect(result).toMatchObject({status: 'unmapped'});
		expect(result.deviceId).toBeUndefined();
	});
});
