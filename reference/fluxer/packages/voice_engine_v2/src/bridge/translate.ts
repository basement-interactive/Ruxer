// SPDX-License-Identifier: AGPL-3.0-or-later

import type {
	VoiceEngineV2Event,
	VoiceEngineV2NativeAudioDeviceModuleStatus,
	VoiceEngineV2TrackKind,
	VoiceEngineV2TrackSource,
} from '../protocol';
import {assertVideoFrameInvariants} from './ffi_assertions';
import type {VoiceEngineV2BridgeEvent, VoiceEngineV2BridgeKnownEventType, VoiceEngineV2BridgeVideoFrame} from './types';

type VoiceEngineV2RoomTrackPublishedEvent = Extract<VoiceEngineV2Event, {type: 'room.trackPublished'}>;

type VoiceEngineV2BridgeRecord = Record<string, unknown>;

function bridgeString(value: unknown): string | null {
	return typeof value === 'string' && value.length > 0 ? value : null;
}

function bridgeBoolean(value: unknown): boolean {
	return value === true;
}

function bridgeAudioDeviceModuleStatus(value: unknown): VoiceEngineV2NativeAudioDeviceModuleStatus | null {
	if (value === 'warming' || value === 'ready' || value === 'failed') return value;
	return null;
}

function normalizeVoiceEngineV2BridgeTrackSource(value: unknown): VoiceEngineV2TrackSource | string {
	switch (value) {
		case 'microphone':
			return 'microphone';
		case 'camera':
			return 'camera';
		case 'screen':
		case 'screen_share':
		case 'screenshare':
			return 'screen';
		case 'screenAudio':
		case 'screen_share_audio':
		case 'screenshareAudio':
		case 'screenshare_audio':
		case 'screen_audio':
		case 'system_audio':
			return 'screenAudio';
		default:
			return 'unknown';
	}
}

function normalizeVoiceEngineV2BridgeTrackKind(value: unknown): VoiceEngineV2TrackKind | null {
	return value === 'audio' || value === 'video' ? value : null;
}

function participantEventFromBridgePayload(payload: VoiceEngineV2BridgeRecord): VoiceEngineV2Event | null {
	const identity = bridgeString(payload.identity);
	const sid = bridgeString(payload.sid);
	if (!identity || !sid) return null;
	return {
		type: 'room.participantJoined',
		participant: {
			identity,
			sid,
			name: bridgeString(payload.name) ?? identity,
		},
	};
}

function trackEventFromBridgePayload(payload: VoiceEngineV2BridgeRecord): VoiceEngineV2RoomTrackPublishedEvent | null {
	const participantIdentity = bridgeString(payload.identity) ?? bridgeString(payload.participantIdentity);
	const participantSid = bridgeString(payload.participantSid);
	const trackSid = bridgeString(payload.trackSid);
	const kind = normalizeVoiceEngineV2BridgeTrackKind(payload.kind);
	if (!participantIdentity || !participantSid || !trackSid || !kind) return null;
	const source = normalizeVoiceEngineV2BridgeTrackSource(payload.source);
	return {
		type: 'room.trackPublished',
		track: {
			participantIdentity,
			participantSid,
			trackSid,
			trackName: bridgeString(payload.trackName) ?? String(source),
			kind,
			source,
			muted: bridgeBoolean(payload.muted),
		},
	};
}

function nativeAudioDeviceModuleStatusEventFromBridgePayload(
	payload: VoiceEngineV2BridgeRecord,
): VoiceEngineV2Event | null {
	const status = bridgeAudioDeviceModuleStatus(payload.status);
	if (!status) return null;
	const detail = bridgeString(payload.detail);
	return {
		type: 'nativeAudioDeviceModule.statusChanged',
		status,
		...(detail ? {detail} : {}),
	};
}

const VOICE_ENGINE_V2_BRIDGE_KNOWN_EVENT_TYPE_FLAGS: {[Type in VoiceEngineV2BridgeKnownEventType]: true} = {
	connected: true,
	connectionState: true,
	disconnected: true,
	participantJoined: true,
	participantLeft: true,
	participantNameChanged: true,
	participantMetadataChanged: true,
	participantAttributesChanged: true,
	trackPublished: true,
	trackUnpublished: true,
	trackSubscribed: true,
	trackUnsubscribed: true,
	trackSubscriptionFailed: true,
	trackMuted: true,
	trackUnmuted: true,
	localTrackPublished: true,
	localTrackUnpublished: true,
	localTrackRepublished: true,
	activeSpeakers: true,
	speakingChanged: true,
	connectionQuality: true,
	dataReceived: true,
	e2eeState: true,
	stats: true,
	audioPlaybackUnavailable: true,
	engineReady: true,
	audioDeviceModuleStatus: true,
};

const VOICE_ENGINE_V2_BRIDGE_KNOWN_EVENT_TYPE_SET: ReadonlySet<string> = new Set(
	Object.keys(VOICE_ENGINE_V2_BRIDGE_KNOWN_EVENT_TYPE_FLAGS),
);

export function isVoiceEngineV2BridgeKnownEventType(value: string): value is VoiceEngineV2BridgeKnownEventType {
	return VOICE_ENGINE_V2_BRIDGE_KNOWN_EVENT_TYPE_SET.has(value);
}

export const VOICE_ENGINE_V2_BRIDGE_DROPPED_EVENTS_COUNT_MAX = 1_000_000_000;

export interface VoiceEngineV2BridgeDroppedEventCounts {
	malformedPayloadCount: number;
	unknownTypeCount: number;
}

let bridgeMalformedPayloadCount = 0;
let bridgeUnknownTypeCount = 0;

function saturatingDroppedEventCount(count: number): number {
	return Math.min(count + 1, VOICE_ENGINE_V2_BRIDGE_DROPPED_EVENTS_COUNT_MAX);
}

export function getVoiceEngineV2BridgeDroppedEventCounts(): VoiceEngineV2BridgeDroppedEventCounts {
	return {
		malformedPayloadCount: bridgeMalformedPayloadCount,
		unknownTypeCount: bridgeUnknownTypeCount,
	};
}

export function resetVoiceEngineV2BridgeDroppedEventCounts(): void {
	bridgeMalformedPayloadCount = 0;
	bridgeUnknownTypeCount = 0;
}

type VoiceEngineV2BridgeTranslationResult = Array<VoiceEngineV2Event> | 'ignored' | 'malformed';

export function translateVoiceEngineV2BridgeEventToEvents(event: VoiceEngineV2BridgeEvent): Array<VoiceEngineV2Event> {
	if (!isVoiceEngineV2BridgeKnownEventType(event.type)) {
		bridgeUnknownTypeCount = saturatingDroppedEventCount(bridgeUnknownTypeCount);
		return [];
	}
	const payload = event.payload as VoiceEngineV2BridgeRecord;
	const translated = translateKnownVoiceEngineV2BridgeEvent(event.type, payload);
	if (translated === 'ignored') return [];
	if (translated === 'malformed') {
		bridgeMalformedPayloadCount = saturatingDroppedEventCount(bridgeMalformedPayloadCount);
		return [];
	}
	return translated;
}

function translateKnownVoiceEngineV2BridgeEvent(
	type: VoiceEngineV2BridgeKnownEventType,
	payload: VoiceEngineV2BridgeRecord,
): VoiceEngineV2BridgeTranslationResult {
	switch (type) {
		case 'participantJoined':
		case 'participantNameChanged':
		case 'participantMetadataChanged':
		case 'participantAttributesChanged': {
			const participantEvent = participantEventFromBridgePayload(payload);
			return participantEvent ? [participantEvent] : 'malformed';
		}
		case 'participantLeft':
			return participantLeftEventsFromBridgePayload(payload);
		case 'trackPublished':
		case 'localTrackPublished': {
			const trackEvent = trackEventFromBridgePayload(payload);
			return trackEvent ? [trackEvent] : 'malformed';
		}
		case 'trackSubscribed':
			return trackSubscribedEventsFromBridgePayload(payload);
		case 'trackUnpublished':
		case 'localTrackUnpublished': {
			const trackSid = bridgeString(payload.trackSid);
			return trackSid
				? [
						{type: 'room.trackUnpublished', trackSid},
						{type: 'inboundVideo.trackUnsubscribed', trackSid},
					]
				: 'malformed';
		}
		case 'trackUnsubscribed':
		case 'trackSubscriptionFailed': {
			const trackSid = bridgeString(payload.trackSid);
			return trackSid ? [{type: 'inboundVideo.trackUnsubscribed', trackSid}] : 'malformed';
		}
		case 'trackMuted': {
			const trackSid = bridgeString(payload.trackSid);
			return trackSid ? [{type: 'room.trackMuted', trackSid}] : 'malformed';
		}
		case 'trackUnmuted': {
			const trackSid = bridgeString(payload.trackSid);
			return trackSid ? [{type: 'room.trackUnmuted', trackSid}] : 'malformed';
		}
		case 'activeSpeakers':
			return Array.isArray(payload.participants)
				? payload.participants.flatMap((participant) =>
						typeof participant === 'object' && participant !== null
							? (participantEventFromBridgePayload(participant as VoiceEngineV2BridgeRecord) ?? [])
							: [],
					)
				: 'malformed';
		case 'connected':
		case 'connectionState':
		case 'disconnected':
		case 'localTrackRepublished':
		case 'speakingChanged':
		case 'connectionQuality':
		case 'dataReceived':
		case 'e2eeState':
		case 'stats':
		case 'audioPlaybackUnavailable':
		case 'engineReady':
			return 'ignored';
		case 'audioDeviceModuleStatus': {
			const event = nativeAudioDeviceModuleStatusEventFromBridgePayload(payload);
			return event ? [event] : 'malformed';
		}
	}
}

function participantLeftEventsFromBridgePayload(
	payload: VoiceEngineV2BridgeRecord,
): VoiceEngineV2BridgeTranslationResult {
	const participantIdentity = bridgeString(payload.identity);
	const participantSid = bridgeString(payload.sid);
	if (!participantIdentity && !participantSid) return 'malformed';
	return [
		{
			type: 'room.participantLeft',
			...(participantIdentity ? {participantIdentity} : {}),
			...(participantSid ? {participantSid} : {}),
		},
	];
}

function trackSubscribedEventsFromBridgePayload(
	payload: VoiceEngineV2BridgeRecord,
): VoiceEngineV2BridgeTranslationResult {
	const trackEvent = trackEventFromBridgePayload(payload);
	if (!trackEvent) return 'malformed';
	if (trackEvent.track.kind !== 'video') return [trackEvent];
	return [
		trackEvent,
		{
			type: 'inboundVideo.trackSubscribed',
			track: {
				participantSid: trackEvent.track.participantSid,
				participantIdentity: trackEvent.track.participantIdentity,
				trackSid: trackEvent.track.trackSid,
				source: trackEvent.track.source,
			},
		},
	];
}

export function translateVoiceEngineV2BridgeVideoFrameToEvent(
	frame: VoiceEngineV2BridgeVideoFrame,
): VoiceEngineV2Event {
	assertVideoFrameInvariants({
		widthPx: frame.meta.width,
		heightPx: frame.meta.height,
		frameBytes: frame.data.byteLength,
		timestampNs: frame.meta.timestampUs * 1000,
	});
	return {
		type: 'inboundVideo.frameReceived',
		frame: {
			participantSid: frame.meta.participantSid,
			trackSid: frame.meta.trackSid,
			width: frame.meta.width,
			height: frame.meta.height,
			timestampUs: frame.meta.timestampUs,
			byteLength: frame.data.byteLength,
		},
	};
}
