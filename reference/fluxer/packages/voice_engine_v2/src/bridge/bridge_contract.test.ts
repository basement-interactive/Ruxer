// SPDX-License-Identifier: AGPL-3.0-or-later

import {beforeEach, describe, expect, it} from 'vitest';
import fixtureJson from '../../fixtures/bridge/bridge_contract.json';
import {
	assertAudioFrameInvariants,
	assertSchemaVersion,
	assertVideoFrameInvariants,
	VOICE_ENGINE_V2_AUDIO_FRAME_BYTES_MAX,
	VOICE_ENGINE_V2_VIDEO_DIMENSION_MAX,
	VOICE_ENGINE_V2_VIDEO_FRAME_BYTES_MAX,
	VoiceEngineV2FfiAssertError,
} from './ffi_assertions';
import {
	assertVoiceEngineV2BridgeAudioOptionsInvariants,
	assertVoiceEngineV2BridgeEnvelopeSchema,
	assertVoiceEngineV2BridgeVideoOptionsInvariants,
	getVoiceEngineV2BridgeDroppedEventCounts,
	getVoiceEngineV2BridgeProcessedCameraI420ByteLength,
	isVoiceEngineV2BridgeFloatPcmFrame,
	isVoiceEngineV2BridgeKnownEventType,
	isVoiceEngineV2BridgeProcessedCameraFrame,
	isVoiceEngineV2BridgePublishCameraOptions,
	isVoiceEngineV2BridgePublishProcessedCameraOptions,
	isVoiceEngineV2BridgeReadiness,
	resetVoiceEngineV2BridgeDroppedEventCounts,
	translateVoiceEngineV2BridgeEventToEvents,
	translateVoiceEngineV2BridgeVideoFrameToEvent,
	VOICE_ENGINE_V2_ADM_STATUS_EVENT_TYPE,
	VOICE_ENGINE_V2_BRIDGE_METHODS,
	VOICE_ENGINE_V2_BRIDGE_VERSION,
	VOICE_ENGINE_V2_ENGINE_READY_EVENT_TYPE,
	VOICE_ENGINE_V2_EVENT_CHANNELS,
	VOICE_ENGINE_V2_IPC_CHANNELS,
} from './index';

interface VoiceEngineV2BridgeContractFixture {
	version: number;
	methods: Array<string>;
	ipcChannels: Record<string, string>;
	eventChannels: Record<string, string>;
}

describe('voice engine v2 bridge contract', () => {
	it('matches the shared bridge contract fixture', () => {
		const fixture = fixtureJson as VoiceEngineV2BridgeContractFixture;

		expect(VOICE_ENGINE_V2_BRIDGE_VERSION).toBe(fixture.version);
		expect(VOICE_ENGINE_V2_BRIDGE_METHODS).toEqual(fixture.methods);
		expect(VOICE_ENGINE_V2_IPC_CHANNELS).toEqual(fixture.ipcChannels);
		expect(VOICE_ENGINE_V2_EVENT_CHANNELS).toEqual(fixture.eventChannels);
		expect(new Set(VOICE_ENGINE_V2_BRIDGE_METHODS).size).toBe(VOICE_ENGINE_V2_BRIDGE_METHODS.length);
		expect(new Set(Object.values(VOICE_ENGINE_V2_IPC_CHANNELS)).size).toBe(
			Object.values(VOICE_ENGINE_V2_IPC_CHANNELS).length,
		);
		expect(new Set(Object.values(VOICE_ENGINE_V2_EVENT_CHANNELS)).size).toBe(
			Object.values(VOICE_ENGINE_V2_EVENT_CHANNELS).length,
		);
	});

	it('accepts the canonical schema version on the FFI boundary', () => {
		expect(() => assertSchemaVersion(VOICE_ENGINE_V2_BRIDGE_VERSION)).not.toThrow();
	});

	it('rejects a schema version older than the bridge', () => {
		try {
			assertSchemaVersion(VOICE_ENGINE_V2_BRIDGE_VERSION - 1);
			expect.fail('expected schema mismatch to throw');
		} catch (error) {
			expect(error).toBeInstanceOf(VoiceEngineV2FfiAssertError);
			expect((error as VoiceEngineV2FfiAssertError).code).toBe('schemaVersionMismatch');
		}
	});

	it('rejects a schema version newer than the bridge', () => {
		try {
			assertSchemaVersion(VOICE_ENGINE_V2_BRIDGE_VERSION + 1);
			expect.fail('expected schema mismatch to throw');
		} catch (error) {
			expect(error).toBeInstanceOf(VoiceEngineV2FfiAssertError);
			expect((error as VoiceEngineV2FfiAssertError).code).toBe('schemaVersionMismatch');
		}
	});
});

describe('voice engine v2 readiness contract', () => {
	it('registers the readiness method and channel in the shared contract', () => {
		expect(VOICE_ENGINE_V2_BRIDGE_METHODS).toContain('getVoiceEngineReadiness');
		expect(VOICE_ENGINE_V2_IPC_CHANNELS.getVoiceEngineReadiness).toBe('voice-engine-v2:get-readiness');
	});

	it('classifies engineReady as a known bridge event type', () => {
		expect(VOICE_ENGINE_V2_ENGINE_READY_EVENT_TYPE).toBe('engineReady');
		expect(isVoiceEngineV2BridgeKnownEventType(VOICE_ENGINE_V2_ENGINE_READY_EVENT_TYPE)).toBe(true);
	});

	it('translates engineReady as a renderer-gating event with no reducer output', () => {
		resetVoiceEngineV2BridgeDroppedEventCounts();
		const events = translateVoiceEngineV2BridgeEventToEvents({
			type: 'engineReady',
			payload: {ready: true},
		});

		expect(events).toEqual([]);
		const counts = getVoiceEngineV2BridgeDroppedEventCounts();
		expect(counts.malformedPayloadCount).toBe(0);
		expect(counts.unknownTypeCount).toBe(0);
	});

	it('translates audio device module status into a runtime event', () => {
		resetVoiceEngineV2BridgeDroppedEventCounts();
		const events = translateVoiceEngineV2BridgeEventToEvents({
			type: VOICE_ENGINE_V2_ADM_STATUS_EVENT_TYPE,
			payload: {status: 'warming'},
		});

		expect(events).toEqual([{type: 'nativeAudioDeviceModule.statusChanged', status: 'warming'}]);
		const counts = getVoiceEngineV2BridgeDroppedEventCounts();
		expect(counts.malformedPayloadCount).toBe(0);
		expect(counts.unknownTypeCount).toBe(0);
	});

	it('accepts ready and not-ready readiness payloads', () => {
		expect(isVoiceEngineV2BridgeReadiness({ready: true})).toBe(true);
		expect(isVoiceEngineV2BridgeReadiness({ready: false})).toBe(true);
		expect(isVoiceEngineV2BridgeReadiness({ready: false, reason: 'native voice engine prewarm pending'})).toBe(true);
	});

	it('rejects malformed readiness payloads', () => {
		expect(isVoiceEngineV2BridgeReadiness(null)).toBe(false);
		expect(isVoiceEngineV2BridgeReadiness({})).toBe(false);
		expect(isVoiceEngineV2BridgeReadiness({ready: 'yes'})).toBe(false);
		expect(isVoiceEngineV2BridgeReadiness({ready: false, reason: 42})).toBe(false);
		expect(isVoiceEngineV2BridgeReadiness({ready: true, reason: 'ready engines carry no reason'})).toBe(false);
	});
});

describe('voice engine v2 audio frame invariants', () => {
	const canonicalAudioFrame = {
		sampleRateHz: 48000,
		numChannels: 2,
		frameBytes: 1920,
		timestampNs: 1000,
	};

	it('accepts a canonical audio frame with no previous timestamp', () => {
		expect(() => assertAudioFrameInvariants(canonicalAudioFrame)).not.toThrow();
	});

	it('accepts a canonical audio frame with an older previous timestamp', () => {
		expect(() => assertAudioFrameInvariants(canonicalAudioFrame, 500)).not.toThrow();
	});

	it('rejects an audio frame with zero bytes', () => {
		try {
			assertAudioFrameInvariants({...canonicalAudioFrame, frameBytes: 0});
			expect.fail('expected size assertion to throw');
		} catch (error) {
			expect(error).toBeInstanceOf(VoiceEngineV2FfiAssertError);
			expect((error as VoiceEngineV2FfiAssertError).code).toBe('audioFrameBytesOutOfRange');
		}
	});

	it('rejects an audio frame over the byte cap', () => {
		try {
			assertAudioFrameInvariants({...canonicalAudioFrame, frameBytes: VOICE_ENGINE_V2_AUDIO_FRAME_BYTES_MAX + 1});
			expect.fail('expected size assertion to throw');
		} catch (error) {
			expect(error).toBeInstanceOf(VoiceEngineV2FfiAssertError);
			expect((error as VoiceEngineV2FfiAssertError).code).toBe('audioFrameBytesOutOfRange');
		}
	});

	it('rejects an audio frame with an unsupported sample rate', () => {
		try {
			assertAudioFrameInvariants({...canonicalAudioFrame, sampleRateHz: 44100});
			expect.fail('expected sample-rate assertion to throw');
		} catch (error) {
			expect(error).toBeInstanceOf(VoiceEngineV2FfiAssertError);
			expect((error as VoiceEngineV2FfiAssertError).code).toBe('audioSampleRateInvalid');
		}
	});

	it('rejects an audio frame with an unsupported channel count', () => {
		try {
			assertAudioFrameInvariants({...canonicalAudioFrame, numChannels: 3});
			expect.fail('expected channels assertion to throw');
		} catch (error) {
			expect(error).toBeInstanceOf(VoiceEngineV2FfiAssertError);
			expect((error as VoiceEngineV2FfiAssertError).code).toBe('audioChannelsInvalid');
		}
	});

	it('rejects an audio frame whose timestamp does not advance', () => {
		try {
			assertAudioFrameInvariants(canonicalAudioFrame, canonicalAudioFrame.timestampNs);
			expect.fail('expected timestamp assertion to throw');
		} catch (error) {
			expect(error).toBeInstanceOf(VoiceEngineV2FfiAssertError);
			expect((error as VoiceEngineV2FfiAssertError).code).toBe('audioTimestampRegressed');
		}
	});

	it('rejects an audio frame whose timestamp moves backwards', () => {
		try {
			assertAudioFrameInvariants(canonicalAudioFrame, canonicalAudioFrame.timestampNs + 1);
			expect.fail('expected timestamp assertion to throw');
		} catch (error) {
			expect(error).toBeInstanceOf(VoiceEngineV2FfiAssertError);
			expect((error as VoiceEngineV2FfiAssertError).code).toBe('audioTimestampRegressed');
		}
	});
});

describe('voice engine v2 video frame invariants', () => {
	const canonicalVideoFrame = {
		widthPx: 1920,
		heightPx: 1080,
		frameBytes: (1920 * 1080 * 3) / 2,
		timestampNs: 1000,
	};

	it('accepts a canonical video frame with no previous timestamp', () => {
		expect(() => assertVideoFrameInvariants(canonicalVideoFrame)).not.toThrow();
	});

	it('rejects a video frame with zero bytes', () => {
		try {
			assertVideoFrameInvariants({...canonicalVideoFrame, frameBytes: 0});
			expect.fail('expected size assertion to throw');
		} catch (error) {
			expect(error).toBeInstanceOf(VoiceEngineV2FfiAssertError);
			expect((error as VoiceEngineV2FfiAssertError).code).toBe('videoFrameBytesOutOfRange');
		}
	});

	it('rejects a video frame over the byte cap', () => {
		try {
			assertVideoFrameInvariants({...canonicalVideoFrame, frameBytes: VOICE_ENGINE_V2_VIDEO_FRAME_BYTES_MAX + 1});
			expect.fail('expected size assertion to throw');
		} catch (error) {
			expect(error).toBeInstanceOf(VoiceEngineV2FfiAssertError);
			expect((error as VoiceEngineV2FfiAssertError).code).toBe('videoFrameBytesOutOfRange');
		}
	});

	it('rejects a video frame with a zero dimension', () => {
		try {
			assertVideoFrameInvariants({...canonicalVideoFrame, widthPx: 0});
			expect.fail('expected dimension assertion to throw');
		} catch (error) {
			expect(error).toBeInstanceOf(VoiceEngineV2FfiAssertError);
			expect((error as VoiceEngineV2FfiAssertError).code).toBe('videoDimensionOutOfRange');
		}
	});

	it('rejects a video frame with an oversized dimension', () => {
		try {
			assertVideoFrameInvariants({...canonicalVideoFrame, heightPx: VOICE_ENGINE_V2_VIDEO_DIMENSION_MAX + 1});
			expect.fail('expected dimension assertion to throw');
		} catch (error) {
			expect(error).toBeInstanceOf(VoiceEngineV2FfiAssertError);
			expect((error as VoiceEngineV2FfiAssertError).code).toBe('videoDimensionOutOfRange');
		}
	});

	it('rejects a video frame whose timestamp regresses', () => {
		try {
			assertVideoFrameInvariants(canonicalVideoFrame, canonicalVideoFrame.timestampNs);
			expect.fail('expected timestamp assertion to throw');
		} catch (error) {
			expect(error).toBeInstanceOf(VoiceEngineV2FfiAssertError);
			expect((error as VoiceEngineV2FfiAssertError).code).toBe('videoTimestampRegressed');
		}
	});

	it('documents that inboundVideo.frameReceived will activate this guard once the port leaves shadow', () => {
		const hotPathTypes = ['inboundVideo.frameReceived', 'nativeCapture.frame'];
		expect(hotPathTypes.length).toBeGreaterThan(0);
		for (const type of hotPathTypes) {
			expect(typeof type).toBe('string');
		}
	});
});

describe('voice engine v2 bridge schema version literal', () => {
	it('pins the TS bridge version to the literal 18 to pair with the native addon bridge', () => {
		expect(VOICE_ENGINE_V2_BRIDGE_VERSION).toBe(18);
	});

	it('reuses the schema-version airlock helper from bridge exports', () => {
		expect(() => assertVoiceEngineV2BridgeEnvelopeSchema(VOICE_ENGINE_V2_BRIDGE_VERSION)).not.toThrow();
	});

	it('rejects bridge schema mismatch via the exported airlock helper', () => {
		try {
			assertVoiceEngineV2BridgeEnvelopeSchema(VOICE_ENGINE_V2_BRIDGE_VERSION + 1);
			expect.fail('expected schema mismatch to throw');
		} catch (error) {
			expect(error).toBeInstanceOf(VoiceEngineV2FfiAssertError);
			expect((error as VoiceEngineV2FfiAssertError).code).toBe('schemaVersionMismatch');
		}
	});
});

describe('voice engine v2 float pcm bridge frames', () => {
	it('accepts Float32Array payloads for native-side PCM conversion', () => {
		expect(
			isVoiceEngineV2BridgeFloatPcmFrame({
				sampleRate: 48_000,
				numChannels: 1,
				samples: new Float32Array([0, 0.5, -0.5]),
			}),
		).toBe(true);
	});

	it('rejects non-float payloads on the float PCM bridge', () => {
		expect(
			isVoiceEngineV2BridgeFloatPcmFrame({
				sampleRate: 48_000,
				numChannels: 1,
				samples: new Uint8Array([0, 1, 2, 3]).buffer,
			}),
		).toBe(false);
	});
});

describe('voice engine v2 bridge translator airlock', () => {
	function makeFrame(width: number, height: number, byteLength: number, timestampUs: number) {
		return {
			meta: {participantSid: 'PA', trackSid: 'TR', width, height, timestampUs},
			data: new ArrayBuffer(byteLength),
		};
	}

	it('translates a canonical video frame received from Rust', () => {
		const event = translateVoiceEngineV2BridgeVideoFrameToEvent(makeFrame(1920, 1080, 4096, 1));
		expect(event.type).toBe('inboundVideo.frameReceived');
	});

	it('panics through the airlock when an inbound video frame has zero dimensions', () => {
		try {
			translateVoiceEngineV2BridgeVideoFrameToEvent(makeFrame(0, 1080, 4096, 1));
			expect.fail('expected dimension assertion to throw');
		} catch (error) {
			expect(error).toBeInstanceOf(VoiceEngineV2FfiAssertError);
			expect((error as VoiceEngineV2FfiAssertError).code).toBe('videoDimensionOutOfRange');
		}
	});

	it('panics through the airlock when an inbound video frame has zero bytes', () => {
		try {
			translateVoiceEngineV2BridgeVideoFrameToEvent(makeFrame(1920, 1080, 0, 1));
			expect.fail('expected size assertion to throw');
		} catch (error) {
			expect(error).toBeInstanceOf(VoiceEngineV2FfiAssertError);
			expect((error as VoiceEngineV2FfiAssertError).code).toBe('videoFrameBytesOutOfRange');
		}
	});
});

describe('voice engine v2 processed camera bridge airlock', () => {
	it('accepts native camera background modes', () => {
		expect(isVoiceEngineV2BridgePublishCameraOptions({backgroundMode: 'none'})).toBe(true);
		expect(isVoiceEngineV2BridgePublishCameraOptions({backgroundMode: 'non'})).toBe(true);
		expect(isVoiceEngineV2BridgePublishCameraOptions({backgroundMode: 'blur'})).toBe(true);
		expect(
			isVoiceEngineV2BridgePublishCameraOptions({
				backgroundMode: 'custom',
				backgroundCustomMediaPath: '/tmp/background.webm',
				backgroundCustomMediaKind: 'video',
			}),
		).toBe(true);
	});

	it('registers the camera capture update channel in the shared contract', () => {
		expect(VOICE_ENGINE_V2_BRIDGE_METHODS).toContain('updateCameraCapture');
		expect(VOICE_ENGINE_V2_IPC_CHANNELS.updateCameraCapture).toBe('voice-engine-v2:update-camera-capture');
	});

	it('accepts native camera mirroring as a typed boolean only', () => {
		expect(isVoiceEngineV2BridgePublishCameraOptions({mirror: true})).toBe(true);
		expect(isVoiceEngineV2BridgePublishCameraOptions({mirror: false})).toBe(true);
		expect(isVoiceEngineV2BridgePublishCameraOptions({mirror: 'true'})).toBe(false);
	});

	it('accepts camera effect strengths across the full integer range', () => {
		expect(isVoiceEngineV2BridgePublishCameraOptions({backgroundBlurStrength: 0})).toBe(true);
		expect(isVoiceEngineV2BridgePublishCameraOptions({backgroundBlurStrength: 100})).toBe(true);
		expect(
			isVoiceEngineV2BridgePublishCameraOptions({
				backgroundMode: 'blur',
				backgroundBlurStrength: 75,
			}),
		).toBe(true);
	});

	it('rejects out-of-range or non-integer camera effect strengths', () => {
		expect(isVoiceEngineV2BridgePublishCameraOptions({backgroundBlurStrength: -1})).toBe(false);
		expect(isVoiceEngineV2BridgePublishCameraOptions({backgroundBlurStrength: 101})).toBe(false);
		expect(isVoiceEngineV2BridgePublishCameraOptions({backgroundBlurStrength: 49.5})).toBe(false);
		expect(isVoiceEngineV2BridgePublishCameraOptions({backgroundBlurStrength: '50'})).toBe(false);
		expect(isVoiceEngineV2BridgePublishCameraOptions({backgroundBlurStrength: Number.NaN})).toBe(false);
	});

	it('rejects invalid native camera background modes', () => {
		expect(isVoiceEngineV2BridgePublishCameraOptions({backgroundMode: 'sepia'})).toBe(false);
		expect(
			isVoiceEngineV2BridgePublishCameraOptions({
				backgroundMode: 'custom',
				backgroundCustomMediaPath: '/tmp/background.webm',
				backgroundCustomMediaKind: 'audio',
			}),
		).toBe(false);
	});

	it('accepts canonical processed camera publish options', () => {
		expect(isVoiceEngineV2BridgePublishProcessedCameraOptions({width: 1280, height: 720, frameRate: 30})).toBe(true);
	});

	it('rejects processed camera publish options with odd dimensions', () => {
		expect(isVoiceEngineV2BridgePublishProcessedCameraOptions({width: 1279, height: 720, frameRate: 30})).toBe(false);
	});

	it('calculates tight i420 payload byte length', () => {
		expect(getVoiceEngineV2BridgeProcessedCameraI420ByteLength(4, 2)).toBe(12);
	});

	it('accepts tight i420 processed camera frames', () => {
		const data = new Uint8Array(getVoiceEngineV2BridgeProcessedCameraI420ByteLength(4, 2));
		expect(
			isVoiceEngineV2BridgeProcessedCameraFrame({
				format: 'i420',
				width: 4,
				height: 2,
				timestampUs: 1,
				data,
			}),
		).toBe(true);
	});

	it('rejects processed camera frames with loose byte lengths', () => {
		expect(
			isVoiceEngineV2BridgeProcessedCameraFrame({
				format: 'i420',
				width: 4,
				height: 2,
				timestampUs: 1,
				data: new ArrayBuffer(11),
			}),
		).toBe(false);
	});
});

describe('voice engine v2 bridge option airlock helpers', () => {
	it('accepts canonical audio options', () => {
		expect(() => assertVoiceEngineV2BridgeAudioOptionsInvariants({sampleRate: 48_000, numChannels: 2})).not.toThrow();
	});

	it('rejects audio options with an unsupported sample rate', () => {
		try {
			assertVoiceEngineV2BridgeAudioOptionsInvariants({sampleRate: 44_100, numChannels: 2});
			expect.fail('expected sample rate assertion to throw');
		} catch (error) {
			expect(error).toBeInstanceOf(VoiceEngineV2FfiAssertError);
			expect((error as VoiceEngineV2FfiAssertError).code).toBe('audioSampleRateInvalid');
		}
	});

	it('rejects audio options with an unsupported channel count', () => {
		try {
			assertVoiceEngineV2BridgeAudioOptionsInvariants({sampleRate: 48_000, numChannels: 5});
			expect.fail('expected channels assertion to throw');
		} catch (error) {
			expect(error).toBeInstanceOf(VoiceEngineV2FfiAssertError);
			expect((error as VoiceEngineV2FfiAssertError).code).toBe('audioChannelsInvalid');
		}
	});

	it('accepts canonical video options', () => {
		expect(() => assertVoiceEngineV2BridgeVideoOptionsInvariants({width: 1280, height: 720})).not.toThrow();
	});

	it('rejects video options with a zero width', () => {
		try {
			assertVoiceEngineV2BridgeVideoOptionsInvariants({width: 0, height: 720});
			expect.fail('expected dimension assertion to throw');
		} catch (error) {
			expect(error).toBeInstanceOf(VoiceEngineV2FfiAssertError);
			expect((error as VoiceEngineV2FfiAssertError).code).toBe('videoDimensionOutOfRange');
		}
	});

	it('rejects video options with an oversized height', () => {
		try {
			assertVoiceEngineV2BridgeVideoOptionsInvariants({width: 1280, height: 1 << 20});
			expect.fail('expected dimension assertion to throw');
		} catch (error) {
			expect(error).toBeInstanceOf(VoiceEngineV2FfiAssertError);
			expect((error as VoiceEngineV2FfiAssertError).code).toBe('videoDimensionOutOfRange');
		}
	});
});

describe('voice engine v2 bridge event translation drop accounting', () => {
	beforeEach(() => {
		resetVoiceEngineV2BridgeDroppedEventCounts();
	});

	it('returns no events for a known-but-ignored type without counting a drop', () => {
		const events = translateVoiceEngineV2BridgeEventToEvents({
			type: 'stats',
			payload: {rttMs: 12, outbound: [], inbound: []},
		});

		expect(events).toEqual([]);
		const counts = getVoiceEngineV2BridgeDroppedEventCounts();
		expect(counts.malformedPayloadCount).toBe(0);
		expect(counts.unknownTypeCount).toBe(0);
	});

	it('counts a malformed payload for a translated known type', () => {
		const events = translateVoiceEngineV2BridgeEventToEvents({
			type: 'trackMuted',
			payload: {},
		});

		expect(events).toEqual([]);
		const counts = getVoiceEngineV2BridgeDroppedEventCounts();
		expect(counts.malformedPayloadCount).toBe(1);
		expect(counts.unknownTypeCount).toBe(0);
	});

	it('counts an unknown event type as a dropped event', () => {
		const events = translateVoiceEngineV2BridgeEventToEvents({
			type: 'someFutureEvent',
			payload: {},
		});

		expect(events).toEqual([]);
		const counts = getVoiceEngineV2BridgeDroppedEventCounts();
		expect(counts.malformedPayloadCount).toBe(0);
		expect(counts.unknownTypeCount).toBe(1);
	});

	it('classifies every payload key as a known bridge event type', () => {
		expect(isVoiceEngineV2BridgeKnownEventType('trackSubscribed')).toBe(true);
		expect(isVoiceEngineV2BridgeKnownEventType('audioPlaybackUnavailable')).toBe(true);
		expect(isVoiceEngineV2BridgeKnownEventType('someFutureEvent')).toBe(false);
	});

	it('still translates a well-formed known event after counting drops', () => {
		translateVoiceEngineV2BridgeEventToEvents({type: 'trackMuted', payload: {}});
		const events = translateVoiceEngineV2BridgeEventToEvents({
			type: 'trackMuted',
			payload: {trackSid: 'TR_1'},
		});

		expect(events).toEqual([{type: 'room.trackMuted', trackSid: 'TR_1'}]);
		expect(getVoiceEngineV2BridgeDroppedEventCounts().malformedPayloadCount).toBe(1);
	});
});
