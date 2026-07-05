// SPDX-License-Identifier: AGPL-3.0-or-later

import {Logger} from '@app/features/platform/utils/AppLogger';
import {
	asVoiceConnectionQuality,
	asVoiceTrackSource,
	type VoiceConnectionQuality,
	type VoiceTrackSource,
	VoiceTrackSource as VoiceTrackSourceValue,
} from '@app/features/voice/engine/VoiceTrackSource';
import {ScreenShareWatchErrorCode, ScreenShareWatchFailures} from '@app/features/voice/state/ScreenShareWatchFailures';
import type {VoiceEngineV2Stats} from '@fluxer/voice_engine_v2';
import {coerceVoiceEngineV2BridgeStats, type VoiceEngineV2BridgeEvent} from '@fluxer/voice_engine_v2/bridge';

const logger = new Logger('NativeVoiceEngineV2BridgeEventMapper');

export interface NativeVoiceEngineParticipantFields {
	identity: string;
	sid: string;
	name?: string;
	isLocal?: boolean;
	metadata?: string;
	attributes?: Readonly<Record<string, string>>;
	isMicrophoneEnabled?: boolean;
	isCameraEnabled?: boolean;
	isScreenShareEnabled?: boolean;
	isScreenShareAudioEnabled?: boolean;
}

export interface NativeVoiceEngineLocalTrackParticipant {
	participantSid?: string;
	participantIdentity?: string;
}

export interface NativeVoiceEngineLocalTrackPublication {
	trackSid?: string;
	trackName?: string;
}

interface NativeVoiceEngineParticipantTrackFlags {
	isMicrophoneEnabled?: boolean;
	isCameraEnabled?: boolean;
	isScreenShareEnabled?: boolean;
	isScreenShareAudioEnabled?: boolean;
}

export interface NativeVoiceEngineV2BridgeEventManagers {
	participants: {
		upsertParticipantFromNative: (fields: NativeVoiceEngineParticipantFields) => void;
		patchParticipantTrackFlags: (identity: string, flags: NativeVoiceEngineParticipantTrackFlags) => void;
		setConnectionQualityForNative: (sid: string, quality: VoiceConnectionQuality) => void;
		updateActiveSpeakersBySid: (sids: ReadonlyArray<string>) => void;
		applyNativeSpeakingSample: (
			sample: {
				participantSid: string;
				identity: string;
				source: string;
				isLocal: boolean;
				speaking: boolean;
			},
			nowMs?: number,
		) => void;
		sweepNativeSpeakingHeartbeats: (nowMs?: number) => void;
		removeParticipant: (identity: string) => void;
		removeParticipantBySid: (sid: string) => void;
	};
	inboundVideo: {
		registerTrack: (participantSid: string, trackSid: string, source: string, participantIdentity?: string) => void;
		unregisterTrack: (trackSid: string) => void;
		unregisterParticipant: (participantSid: string) => void;
	};
	localMedia: {
		onLocalTrackPublished: (
			source: VoiceTrackSource,
			trackSid?: string,
			participant?: NativeVoiceEngineLocalTrackParticipant,
			publication?: NativeVoiceEngineLocalTrackPublication,
		) => void;
		onLocalTrackUnpublished?: (
			source: VoiceTrackSource,
			trackSid?: string,
			participant?: NativeVoiceEngineLocalTrackParticipant,
			publication?: NativeVoiceEngineLocalTrackPublication,
		) => void;
		onLocalTrackRepublished?: (
			source: VoiceTrackSource,
			trackSid?: string,
			participant?: NativeVoiceEngineLocalTrackParticipant,
			publication?: NativeVoiceEngineLocalTrackPublication,
		) => void;
	};
	e2ee: {
		setState: (sid: string, raw: unknown) => void;
		remove: (sid: string) => void;
	};
	stats: {
		setStats: (stats: VoiceEngineV2Stats, timestampMs?: number) => void;
	};
}

export function ingestNativeVoiceEngineV2BridgeStats(
	stats: VoiceEngineV2Stats,
	managers: NativeVoiceEngineV2BridgeEventManagers,
	timestampMs: number = Date.now(),
): void {
	managers.stats.setStats(stats, timestampMs);
	managers.participants.sweepNativeSpeakingHeartbeats(timestampMs);
}

function asString(value: unknown): string | undefined {
	return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
	return typeof value === 'boolean' ? value : undefined;
}

function asStringArray(value: unknown): Array<string> {
	if (!Array.isArray(value)) return [];
	return value.filter((entry): entry is string => typeof entry === 'string');
}

function asOptionalString(value: unknown): string | undefined {
	return typeof value === 'string' ? value : undefined;
}

function asStringRecord(value: unknown): Readonly<Record<string, string>> | undefined {
	if (value == null || typeof value !== 'object' || Array.isArray(value)) return undefined;
	const entries = Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string');
	return Object.freeze(Object.fromEntries(entries));
}

function asRecordArray(value: unknown): Array<Record<string, unknown>> {
	if (!Array.isArray(value)) return [];
	return value.filter((entry): entry is Record<string, unknown> => entry != null && typeof entry === 'object');
}

export function parseConnectionQuality(value: unknown): VoiceConnectionQuality {
	return asVoiceConnectionQuality(value);
}

function trackFlagsForSource(source: string | undefined, present: boolean): NativeVoiceEngineParticipantTrackFlags {
	switch (asVoiceTrackSource(source)) {
		case VoiceTrackSourceValue.Microphone:
			return {isMicrophoneEnabled: present};
		case VoiceTrackSourceValue.Camera:
			return {isCameraEnabled: present};
		case VoiceTrackSourceValue.ScreenShare:
			return {isScreenShareEnabled: present};
		case VoiceTrackSourceValue.ScreenShareAudio:
			return {isScreenShareAudioEnabled: present};
		default:
			return {};
	}
}

function participantNameFromPayload(payload: Record<string, unknown>): string | undefined {
	return asString(payload.participantName) ?? asString(payload.name);
}

function upsertParticipantFromPayload(
	payload: Record<string, unknown>,
	managers: NativeVoiceEngineV2BridgeEventManagers,
	sidKey: 'sid' | 'participantSid',
): string | undefined {
	const identity = asString(payload.identity);
	const sid = asString(payload[sidKey]);
	if (!identity || !sid) return identity;
	const name = participantNameFromPayload(payload);
	const fields: NativeVoiceEngineParticipantFields = {
		identity,
		sid,
	};
	if (name) fields.name = name;
	const metadata = asOptionalString(payload.metadata);
	if (metadata != null) fields.metadata = metadata;
	const attributes = asStringRecord(payload.attributes);
	if (attributes) fields.attributes = attributes;
	managers.participants.upsertParticipantFromNative(fields);
	return identity;
}

function upsertLocalParticipantFromTrackPayload(
	payload: Record<string, unknown>,
	managers: NativeVoiceEngineV2BridgeEventManagers,
): string | undefined {
	const identity = asString(payload.identity);
	const sid = asString(payload.participantSid);
	if (!identity || !sid) return identity;
	const name = participantNameFromPayload(payload);
	managers.participants.upsertParticipantFromNative(
		name ? {identity, sid, name, isLocal: true} : {identity, sid, isLocal: true},
	);
	return identity;
}

function localTrackParticipantFromPayload(
	payload: Record<string, unknown>,
): NativeVoiceEngineLocalTrackParticipant | undefined {
	const participantSid = asString(payload.participantSid);
	const participantIdentity = asString(payload.identity);
	if (!participantSid && !participantIdentity) return undefined;
	return {
		...(participantSid ? {participantSid} : {}),
		...(participantIdentity ? {participantIdentity} : {}),
	};
}

function localTrackPublicationFromPayload(
	payload: Record<string, unknown>,
): NativeVoiceEngineLocalTrackPublication | undefined {
	const trackName = asString(payload.trackName);
	if (!trackName) return undefined;
	const trackSid = asString(payload.trackSid);
	return {
		...(trackSid ? {trackSid} : {}),
		trackName,
	};
}

function emitLocalTrackPublished(
	managers: NativeVoiceEngineV2BridgeEventManagers,
	source: VoiceTrackSource,
	trackSid: string | undefined,
	participant: NativeVoiceEngineLocalTrackParticipant | undefined,
	publication: NativeVoiceEngineLocalTrackPublication | undefined,
): void {
	if (publication) {
		managers.localMedia.onLocalTrackPublished(source, trackSid, participant, publication);
		return;
	}
	if (participant) {
		managers.localMedia.onLocalTrackPublished(source, trackSid, participant);
		return;
	}
	managers.localMedia.onLocalTrackPublished(source, trackSid);
}

function emitLocalTrackUnpublished(
	managers: NativeVoiceEngineV2BridgeEventManagers,
	source: VoiceTrackSource,
	trackSid: string | undefined,
	participant: NativeVoiceEngineLocalTrackParticipant | undefined,
	publication: NativeVoiceEngineLocalTrackPublication | undefined,
): void {
	if (publication) {
		managers.localMedia.onLocalTrackUnpublished?.(source, trackSid, participant, publication);
		return;
	}
	if (participant) {
		managers.localMedia.onLocalTrackUnpublished?.(source, trackSid, participant);
		return;
	}
	managers.localMedia.onLocalTrackUnpublished?.(source, trackSid);
}

function emitLocalTrackRepublished(
	managers: NativeVoiceEngineV2BridgeEventManagers,
	source: VoiceTrackSource,
	trackSid: string | undefined,
	participant: NativeVoiceEngineLocalTrackParticipant | undefined,
	publication: NativeVoiceEngineLocalTrackPublication | undefined,
): void {
	if (publication) {
		managers.localMedia.onLocalTrackRepublished?.(source, trackSid, participant, publication);
		return;
	}
	if (participant) {
		managers.localMedia.onLocalTrackRepublished?.(source, trackSid, participant);
		return;
	}
	managers.localMedia.onLocalTrackRepublished?.(source, trackSid);
}

function isPublishedTrackEnabled(payload: Record<string, unknown>, present: boolean): boolean {
	return present && asBoolean(payload.muted) !== true;
}

function patchParticipantTrackFlagsFromPayload(
	payload: Record<string, unknown>,
	managers: NativeVoiceEngineV2BridgeEventManagers,
	present: boolean,
	enabledOverride?: boolean,
): void {
	const identity = upsertParticipantFromPayload(payload, managers, 'participantSid');
	if (!identity) return;
	const source = asString(payload.source);
	managers.participants.patchParticipantTrackFlags(
		identity,
		trackFlagsForSource(source, enabledOverride ?? isPublishedTrackEnabled(payload, present)),
	);
}

function isCameraVideoTrackPayload(payload: Record<string, unknown>): boolean {
	if (asString(payload.kind) !== 'video') return false;
	return asVoiceTrackSource(payload.source) === VoiceTrackSourceValue.Camera;
}

function unregisterMutedCameraTrack(
	payload: Record<string, unknown>,
	managers: NativeVoiceEngineV2BridgeEventManagers,
): void {
	if (!isCameraVideoTrackPayload(payload)) return;
	const trackSid = asString(payload.trackSid);
	if (!trackSid) return;
	managers.inboundVideo.unregisterTrack(trackSid);
}

function registerUnmutedCameraTrack(
	payload: Record<string, unknown>,
	managers: NativeVoiceEngineV2BridgeEventManagers,
): void {
	if (!isCameraVideoTrackPayload(payload)) return;
	const participantSid = asString(payload.participantSid);
	const participantIdentity = asString(payload.identity);
	const trackSid = asString(payload.trackSid);
	if (!participantSid || !trackSid) {
		logger.warn('trackUnmuted camera missing participantSid/trackSid', {payload});
		return;
	}
	managers.inboundVideo.registerTrack(participantSid, trackSid, VoiceTrackSourceValue.Camera, participantIdentity);
}

function patchLocalParticipantTrackFlagsFromPayload(
	payload: Record<string, unknown>,
	managers: NativeVoiceEngineV2BridgeEventManagers,
	present: boolean,
): void {
	const identity = upsertLocalParticipantFromTrackPayload(payload, managers);
	if (!identity) return;
	managers.participants.patchParticipantTrackFlags(
		identity,
		trackFlagsForSource(asString(payload.source), isPublishedTrackEnabled(payload, present)),
	);
}

const CONNECTED_ROSTER_PARTICIPANTS_MAX = 1024;
const CONNECTED_ROSTER_TRACKS_PER_PARTICIPANT_MAX = 16;

export function applyNativeVoiceEngineConnectedRoster(
	payload: Record<string, unknown>,
	managers: NativeVoiceEngineV2BridgeEventManagers,
): void {
	const participants = payload.participants;
	if (!Array.isArray(participants)) return;
	if (participants.length > CONNECTED_ROSTER_PARTICIPANTS_MAX) {
		logger.warn('Native voice engine connected roster exceeds cap; extra participants ignored', {
			count: participants.length,
			cap: CONNECTED_ROSTER_PARTICIPANTS_MAX,
		});
	}
	for (const entry of participants.slice(0, CONNECTED_ROSTER_PARTICIPANTS_MAX)) {
		if (typeof entry !== 'object' || entry === null) continue;
		const record = entry as Record<string, unknown>;
		const identity = asString(record.identity);
		const sid = asString(record.sid);
		if (!identity || !sid) {
			logger.warn('Native voice engine connected roster entry missing identity/sid', {entry: record});
			continue;
		}
		const name = asString(record.name);
		managers.participants.upsertParticipantFromNative(name ? {identity, sid, name} : {identity, sid});
		const tracks = record.tracks;
		if (!Array.isArray(tracks)) continue;
		for (const track of tracks.slice(0, CONNECTED_ROSTER_TRACKS_PER_PARTICIPANT_MAX)) {
			if (typeof track !== 'object' || track === null) continue;
			patchParticipantTrackFlagsFromPayload(track as Record<string, unknown>, managers, true);
		}
	}
}

export interface NativeVoiceEngineConnectedRosterPublishedTrack {
	identity: string;
	source: VoiceTrackSource;
}

export function collectNativeVoiceEngineConnectedRosterPublishedTracks(
	payload: Record<string, unknown>,
): Array<NativeVoiceEngineConnectedRosterPublishedTrack> {
	const participants = payload.participants;
	if (!Array.isArray(participants)) return [];
	const tracks: Array<NativeVoiceEngineConnectedRosterPublishedTrack> = [];
	const seen = new Set<string>();
	for (const entry of participants.slice(0, CONNECTED_ROSTER_PARTICIPANTS_MAX)) {
		if (typeof entry !== 'object' || entry === null) continue;
		const record = entry as Record<string, unknown>;
		const identity = asString(record.identity);
		if (!identity) continue;
		const publications = record.tracks;
		if (!Array.isArray(publications)) continue;
		for (const publication of publications.slice(0, CONNECTED_ROSTER_TRACKS_PER_PARTICIPANT_MAX)) {
			if (typeof publication !== 'object' || publication === null) continue;
			const source = asVoiceTrackSource((publication as Record<string, unknown>).source);
			if (
				source !== VoiceTrackSourceValue.Camera &&
				source !== VoiceTrackSourceValue.ScreenShare &&
				source !== VoiceTrackSourceValue.ScreenShareAudio
			) {
				continue;
			}
			const key = `${identity}:${source}`;
			if (seen.has(key)) continue;
			seen.add(key);
			tracks.push({identity, source});
		}
	}
	return tracks;
}

export function isFacadeOwnedConnectionEvent(type: string): boolean {
	return (
		type === 'connected' ||
		type === 'Connected' ||
		type === 'disconnected' ||
		type === 'Disconnected' ||
		type === 'connectionState' ||
		type === 'Reconnecting' ||
		type === 'Reconnected'
	);
}

export type NativeVoiceEngineConnectionEventAction = 'connected' | 'disconnected' | 'reconnecting' | 'reconnected';

export function getNativeVoiceEngineConnectionEventAction(
	event: Pick<VoiceEngineV2BridgeEvent, 'type' | 'payload'>,
): NativeVoiceEngineConnectionEventAction | null {
	const payload = event.payload as Record<string, unknown>;
	switch (event.type) {
		case 'connected':
		case 'Connected':
			return 'connected';
		case 'disconnected':
		case 'Disconnected':
			return 'disconnected';
		case 'Reconnecting':
			return 'reconnecting';
		case 'Reconnected':
			return 'reconnected';
		case 'connectionState':
			switch (asString(payload.state)) {
				case 'connected':
					return 'connected';
				case 'disconnected':
					return 'reconnecting';
				case 'reconnecting':
				case 'signalReconnecting':
				case 'signalreconnecting':
					return 'reconnecting';
				default:
					return null;
			}
		default:
			return null;
	}
}

export function mapNativeVoiceEngineV2BridgeEvent(
	event: VoiceEngineV2BridgeEvent,
	managers: NativeVoiceEngineV2BridgeEventManagers,
): void {
	const payload = event.payload as Record<string, unknown>;
	switch (event.type) {
		case 'connectionState':
			logger.debug('Native engine connection state', {state: payload.state});
			break;
		case 'participantJoined': {
			const identity = asString(payload.identity);
			const sid = asString(payload.sid);
			if (!identity || !sid) {
				logger.warn('participantJoined missing identity/sid', {payload});
				break;
			}
			managers.participants.upsertParticipantFromNative({identity, sid, name: asString(payload.name)});
			break;
		}
		case 'participantNameChanged': {
			const identity = asString(payload.identity);
			const sid = asString(payload.sid);
			const name = asString(payload.name);
			if (!identity || !sid || !name) {
				logger.warn('participantNameChanged missing identity/sid/name', {payload});
				break;
			}
			managers.participants.upsertParticipantFromNative({identity, sid, name});
			break;
		}
		case 'participantMetadataChanged':
		case 'participantAttributesChanged': {
			const identity = upsertParticipantFromPayload(payload, managers, 'sid');
			if (!identity) {
				logger.warn(`${event.type} missing identity/sid`, {payload});
			}
			break;
		}
		case 'participantLeft': {
			const identity = asString(payload.identity);
			const sid = asString(payload.sid);
			if (identity) {
				managers.participants.removeParticipant(identity);
			} else if (sid) {
				managers.participants.removeParticipantBySid(sid);
			}
			if (sid) {
				managers.inboundVideo.unregisterParticipant(sid);
				managers.e2ee.remove(sid);
			}
			break;
		}
		case 'trackPublished': {
			patchParticipantTrackFlagsFromPayload(payload, managers, true);
			break;
		}
		case 'trackUnpublished': {
			patchParticipantTrackFlagsFromPayload(payload, managers, false);
			const trackSid = asString(payload.trackSid);
			if (trackSid) {
				managers.inboundVideo.unregisterTrack(trackSid);
			}
			break;
		}
		case 'trackSubscribed': {
			const participantSid = asString(payload.participantSid);
			const participantIdentity = asString(payload.identity);
			const trackSid = asString(payload.trackSid);
			const kind = asString(payload.kind);
			const source = asString(payload.source);
			if (!participantSid || !trackSid) {
				logger.warn('trackSubscribed missing participantSid/trackSid', {payload});
				break;
			}
			patchParticipantTrackFlagsFromPayload(payload, managers, true);
			if (kind === 'video') {
				managers.inboundVideo.registerTrack(participantSid, trackSid, asVoiceTrackSource(source), participantIdentity);
			}
			break;
		}
		case 'trackUnsubscribed': {
			const participantSid = asString(payload.participantSid);
			const trackSid = asString(payload.trackSid);
			if (!trackSid) {
				logger.warn('trackUnsubscribed missing trackSid', {payload});
				break;
			}
			managers.inboundVideo.unregisterTrack(trackSid);
			if (!participantSid) {
				logger.debug('trackUnsubscribed without participantSid; tile torn down by trackSid only', {trackSid});
			}
			break;
		}
		case 'trackMuted':
		case 'trackUnmuted': {
			const unmuted = event.type === 'trackUnmuted';
			patchParticipantTrackFlagsFromPayload(payload, managers, unmuted, unmuted);
			if (event.type === 'trackMuted') {
				unregisterMutedCameraTrack(payload, managers);
			} else {
				registerUnmutedCameraTrack(payload, managers);
			}
			break;
		}
		case 'trackSubscriptionFailed': {
			const trackSid = asString(payload.trackSid);
			if (trackSid) {
				managers.inboundVideo.unregisterTrack(trackSid);
			}
			const source = asVoiceTrackSource(payload.source);
			if (source === VoiceTrackSourceValue.ScreenShare) {
				ScreenShareWatchFailures.reportFailure({
					participantIdentity: asString(payload.identity) ?? asString(payload.participantIdentity),
					participantSid: asString(payload.participantSid),
					trackSid,
					source,
					code: ScreenShareWatchErrorCode.RemoteTrackSubscriptionFailed,
					reason: 'remote-track-subscription-failed',
					error: payload.error ?? payload.reason ?? payload.message,
				});
			}
			break;
		}
		case 'activeSpeakers': {
			for (const participant of asRecordArray(payload.participants)) {
				const identity = asString(participant.identity);
				const sid = asString(participant.sid);
				if (identity && sid) {
					const name = asString(participant.name);
					managers.participants.upsertParticipantFromNative(name ? {identity, sid, name} : {identity, sid});
				}
			}
			managers.participants.updateActiveSpeakersBySid(asStringArray(payload.sids));
			break;
		}
		case 'speakingChanged': {
			const participantSid = asString(payload.participantSid);
			const identity = asString(payload.identity);
			const source = asString(payload.source);
			const isLocal = asBoolean(payload.isLocal);
			const speaking = asBoolean(payload.speaking);
			if (!identity || isLocal === undefined || speaking === undefined) {
				logger.warn('speakingChanged missing identity/isLocal/speaking', {payload});
				break;
			}
			if (source !== 'microphone') {
				logger.warn('speakingChanged from non-microphone track ignored', {payload});
				break;
			}
			managers.participants.applyNativeSpeakingSample({
				participantSid: participantSid ?? '',
				identity,
				source,
				isLocal,
				speaking,
			});
			break;
		}
		case 'connectionQuality': {
			const sid = asString(payload.sid);
			if (!sid) {
				logger.warn('connectionQuality missing sid', {payload});
				break;
			}
			upsertParticipantFromPayload(payload, managers, 'sid');
			managers.participants.setConnectionQualityForNative(sid, parseConnectionQuality(payload.quality));
			break;
		}
		case 'e2eeState': {
			const sid = asString(payload.sid);
			if (!sid) {
				logger.warn('e2eeState missing sid', {payload});
				break;
			}
			upsertParticipantFromPayload(payload, managers, 'sid');
			managers.e2ee.setState(sid, payload.state);
			break;
		}
		case 'stats': {
			const stats = coerceVoiceEngineV2BridgeStats(payload);
			ingestNativeVoiceEngineV2BridgeStats(stats, managers);
			break;
		}
		case 'audioPlaybackUnavailable': {
			logger.warn('Native voice engine audio playback unavailable', {message: asString(payload.message)});
			break;
		}
		case 'localTrackPublished': {
			const source = asVoiceTrackSource(payload.source);
			const trackSid = asString(payload.trackSid);
			const participant = localTrackParticipantFromPayload(payload);
			const publication = localTrackPublicationFromPayload(payload);
			patchLocalParticipantTrackFlagsFromPayload(payload, managers, true);
			emitLocalTrackPublished(managers, source, trackSid, participant, publication);
			break;
		}
		case 'localTrackUnpublished': {
			const source = asVoiceTrackSource(payload.source);
			const trackSid = asString(payload.trackSid);
			const participant = localTrackParticipantFromPayload(payload);
			const publication = localTrackPublicationFromPayload(payload);
			patchLocalParticipantTrackFlagsFromPayload(payload, managers, false);
			emitLocalTrackUnpublished(managers, source, trackSid, participant, publication);
			break;
		}
		case 'localTrackRepublished': {
			const source = asVoiceTrackSource(payload.source);
			const trackSid = asString(payload.trackSid);
			const participant = localTrackParticipantFromPayload(payload);
			const publication = localTrackPublicationFromPayload(payload);
			patchLocalParticipantTrackFlagsFromPayload(payload, managers, true);
			emitLocalTrackRepublished(managers, source, trackSid, participant, publication);
			emitLocalTrackPublished(managers, source, trackSid, participant, publication);
			break;
		}
		case 'TokenRefreshed':
		case 'ParticipantsUpdated':
		case 'RoomUpdated':
			break;
		default:
			logger.debug('Native voice engine event (unmapped)', {type: event.type});
			break;
	}
}
