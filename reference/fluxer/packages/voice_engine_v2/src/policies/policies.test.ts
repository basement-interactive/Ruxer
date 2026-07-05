// SPDX-License-Identifier: AGPL-3.0-or-later

import {describe, expect, it} from 'vitest';
import cameraShareEncodingPlanFixtures from '../../fixtures/policies/camera_share_encoding_plan.json';
import e2eeFixtures from '../../fixtures/policies/e2ee_state_normalization.json';
import hardwareEncoderCapabilityFixtures from '../../fixtures/policies/hardware_encoder_capabilities.json';
import localMediaReconnectFixtures from '../../fixtures/policies/local_media_reconnect_suppression.json';
import microphoneFailureFixtures from '../../fixtures/policies/microphone_failure_action.json';
import connectRetryFixtures from '../../fixtures/policies/native_connect_retry.json';
import volumeFixtures from '../../fixtures/policies/native_participant_volume.json';
import screenShareEncodingPlanFixtures from '../../fixtures/policies/screen_share_encoding_plan.json';
import voiceStatsCoercionFixtures from '../../fixtures/policies/voice_stats_coercion.json';
import voiceStatsSummaryFixtures from '../../fixtures/policies/voice_stats_summary.json';
import voiceTrackClassificationFixtures from '../../fixtures/policies/voice_track_classification.json';
import type {
	VoiceEngineV2CameraEncodingOptions,
	VoiceEngineV2CameraOptions,
	VoiceEngineV2ScreenEncodingOptions,
	VoiceEngineV2ScreenOptions,
	VoiceEngineV2Stats,
} from '../protocol';
import {
	classifyVoiceEngineV2TrackStats,
	coerceVoiceEngineV2Stats,
	computeVoiceEngineV2NativeParticipantVolume,
	getVoiceEngineV2MicrophoneOperationFailureAction,
	hasVoiceEngineV2NativeNvencEncoder,
	normalizeVoiceEngineV2HardwareEncoderCapabilities,
	normalizeVoiceEngineV2ParticipantE2eeState,
	planVoiceEngineV2CameraEncodingChange,
	planVoiceEngineV2ScreenEncodingChange,
	shouldRetryVoiceEngineV2NativeConnectTimeout,
	shouldSuppressVoiceEngineV2LocalTrackStateDuringReconnect,
	summarizeVoiceEngineV2Stats,
	type VoiceEngineV2LocalTrackReconnectState,
	type VoiceEngineV2MicrophoneFailureContext,
	type VoiceEngineV2NativeConnectRetryPolicyInput,
	type VoiceEngineV2OperationResultLike,
	type VoiceEngineV2StatsSummary,
	type VoiceEngineV2StatsTrackClassificationInput,
	type VoiceEngineV2StatsTrackRoleSelection,
} from './index';

interface ConnectRetryFixture {
	name: string;
	input: VoiceEngineV2NativeConnectRetryPolicyInput;
	expected: boolean;
}

interface MicrophoneFailureFixture {
	name: string;
	result: VoiceEngineV2OperationResultLike;
	requestedEnabled: boolean;
	context?: VoiceEngineV2MicrophoneFailureContext;
	expected: string;
}

interface VolumeFixture {
	name: string;
	input: {
		userVolumePercent: number | null;
		outputVolumePercent: number | null;
		locallyMuted: boolean;
	};
	expected?: number;
	expectedRange?: {
		minExclusive?: number;
		maxExclusive?: number;
		minInclusive?: number;
		maxInclusive?: number;
	};
}

interface LocalMediaReconnectFixture {
	name: string;
	input: VoiceEngineV2LocalTrackReconnectState;
	expected: boolean;
}

interface E2eeFixture {
	raw: unknown;
	expected: string;
}

interface HardwareEncoderCapabilityFixture {
	name: string;
	input: unknown;
	codec: string;
	expectedCapabilities: Record<string, unknown>;
	expectedNativeNvenc: boolean;
}

interface ScreenShareEncodingPlanFixture {
	name: string;
	input: {
		published: VoiceEngineV2ScreenOptions | null;
		desired: VoiceEngineV2ScreenOptions | null;
		update: VoiceEngineV2ScreenEncodingOptions;
	};
	expectedAction: string;
	expectedReason: string;
	expectedCodec?: string;
	expectedHardwareEncoding?: boolean;
	expectedZeroCopyRequired?: boolean;
	expectedErrorCode?: string;
}

interface CameraShareEncodingPlanFixture {
	name: string;
	input: {
		published: VoiceEngineV2CameraOptions | null;
		desired: VoiceEngineV2CameraOptions | null;
		update: VoiceEngineV2CameraEncodingOptions;
	};
	expectedAction: string;
	expectedReason: string;
	expectedCodec?: string;
	expectedMirror?: boolean;
	expectedBackgroundMode?: string;
	expectedWidth?: number;
	expectedFrameRate?: number;
	expectedErrorCode?: string;
}

interface VoiceStatsSummaryFixture {
	name: string;
	input: VoiceEngineV2Stats;
	expectedSummary: Partial<VoiceEngineV2StatsSummary>;
}

interface VoiceStatsCoercionFixture {
	name: string;
	input: Record<string, unknown>;
	expected: VoiceEngineV2Stats;
}

interface VoiceTrackClassificationFixture {
	name: string;
	input: VoiceEngineV2StatsTrackClassificationInput;
	expected: VoiceEngineV2StatsTrackRoleSelection;
}

describe('voice engine v2 policies', () => {
	it.each(connectRetryFixtures as Array<ConnectRetryFixture>)('replays native connect retry fixture: $name', ({
		input,
		expected,
	}) => {
		expect(shouldRetryVoiceEngineV2NativeConnectTimeout(input)).toBe(expected);
	});

	it.each(
		microphoneFailureFixtures as Array<MicrophoneFailureFixture>,
	)('replays microphone failure action fixture: $name', ({result, requestedEnabled, context, expected}) => {
		expect(getVoiceEngineV2MicrophoneOperationFailureAction(result, requestedEnabled, context)).toBe(expected);
	});

	it.each(volumeFixtures as Array<VolumeFixture>)('replays native volume fixture: $name', (fixture) => {
		const gain = computeVoiceEngineV2NativeParticipantVolume({
			userVolumePercent: fixture.input.userVolumePercent ?? Number.NaN,
			outputVolumePercent: fixture.input.outputVolumePercent ?? Number.NaN,
			locallyMuted: fixture.input.locallyMuted,
		});
		if (fixture.expected !== undefined) {
			expect(gain).toBeCloseTo(fixture.expected, 5);
		}
		if (fixture.expectedRange?.minExclusive !== undefined) {
			expect(gain).toBeGreaterThan(fixture.expectedRange.minExclusive);
		}
		if (fixture.expectedRange?.maxExclusive !== undefined) {
			expect(gain).toBeLessThan(fixture.expectedRange.maxExclusive);
		}
		if (fixture.expectedRange?.minInclusive !== undefined) {
			expect(gain).toBeGreaterThanOrEqual(fixture.expectedRange.minInclusive);
		}
		if (fixture.expectedRange?.maxInclusive !== undefined) {
			expect(gain).toBeLessThanOrEqual(fixture.expectedRange.maxInclusive);
		}
	});

	it.each(
		localMediaReconnectFixtures as Array<LocalMediaReconnectFixture>,
	)('replays local media reconnect suppression fixture: $name', ({input, expected}) => {
		expect(shouldSuppressVoiceEngineV2LocalTrackStateDuringReconnect(input)).toBe(expected);
	});

	it.each(e2eeFixtures as Array<E2eeFixture>)('replays E2EE state normalization fixture %#', ({raw, expected}) => {
		expect(normalizeVoiceEngineV2ParticipantE2eeState(raw)).toBe(expected);
	});

	it.each(
		hardwareEncoderCapabilityFixtures as Array<HardwareEncoderCapabilityFixture>,
	)('replays hardware encoder capability fixture: $name', ({
		input,
		codec,
		expectedCapabilities,
		expectedNativeNvenc,
	}) => {
		const capabilities = normalizeVoiceEngineV2HardwareEncoderCapabilities(input);
		expect(capabilities).toMatchObject(expectedCapabilities);
		expect(hasVoiceEngineV2NativeNvencEncoder(capabilities, codec)).toBe(expectedNativeNvenc);
	});

	it.each(
		screenShareEncodingPlanFixtures as Array<ScreenShareEncodingPlanFixture>,
	)('replays screen-share encoding plan fixture: $name', (fixture) => {
		const plan = planVoiceEngineV2ScreenEncodingChange(fixture.input);
		expect(plan.action).toBe(fixture.expectedAction);
		expect(plan.reason).toBe(fixture.expectedReason);
		if (fixture.expectedCodec !== undefined) {
			expect(plan.desired?.codec).toBe(fixture.expectedCodec);
		}
		if (fixture.expectedHardwareEncoding !== undefined) {
			expect(plan.desired?.hardwareEncoding).toBe(fixture.expectedHardwareEncoding);
		}
		if (fixture.expectedZeroCopyRequired !== undefined) {
			expect(plan.desired?.zeroCopyRequired).toBe(fixture.expectedZeroCopyRequired);
		}
		if (fixture.expectedErrorCode !== undefined) {
			expect(plan.error?.code).toBe(fixture.expectedErrorCode);
		}
	});

	it.each(
		cameraShareEncodingPlanFixtures as Array<CameraShareEncodingPlanFixture>,
	)('replays camera-share encoding plan fixture: $name', (fixture) => {
		const plan = planVoiceEngineV2CameraEncodingChange(fixture.input);
		expect(plan.action).toBe(fixture.expectedAction);
		expect(plan.reason).toBe(fixture.expectedReason);
		if (fixture.expectedCodec !== undefined) {
			expect(plan.desired?.codec).toBe(fixture.expectedCodec);
		}
		if (fixture.expectedMirror !== undefined) {
			expect(plan.desired?.mirror).toBe(fixture.expectedMirror);
		}
		if (fixture.expectedBackgroundMode !== undefined) {
			expect(plan.desired?.backgroundMode).toBe(fixture.expectedBackgroundMode);
		}
		if (fixture.expectedWidth !== undefined) {
			expect(plan.desired?.width).toBe(fixture.expectedWidth);
		}
		if (fixture.expectedFrameRate !== undefined) {
			expect(plan.desired?.frameRate).toBe(fixture.expectedFrameRate);
		}
		if (fixture.expectedErrorCode !== undefined) {
			expect(plan.error?.code).toBe(fixture.expectedErrorCode);
		}
	});

	it.each(
		voiceStatsCoercionFixtures as Array<VoiceStatsCoercionFixture>,
	)('replays voice stats coercion fixture: $name', ({input, expected}) => {
		expect(coerceVoiceEngineV2Stats(input)).toMatchObject(expected);
	});

	it.each(voiceStatsSummaryFixtures as Array<VoiceStatsSummaryFixture>)('replays voice stats summary fixture: $name', ({
		input,
		expectedSummary,
	}) => {
		expect(summarizeVoiceEngineV2Stats(input)).toMatchObject(expectedSummary);
	});

	it.each(
		voiceTrackClassificationFixtures as Array<VoiceTrackClassificationFixture>,
	)('replays voice track classification fixture: $name', ({input, expected}) => {
		expect(classifyVoiceEngineV2TrackStats(input)).toEqual(expected);
	});
});
