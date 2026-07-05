// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';
import {Logger} from '@app/features/platform/utils/AppLogger';
import {getStreamKey} from '@app/features/voice/components/StreamKeys';
import {computeNativeParticipantVolume} from '@app/features/voice/engine/native_voice_engine/nativeVoiceVolume';
import type {VoiceEngine} from '@app/features/voice/engine/native_voice_engine/VoiceEngine';
import {getEffectiveAudioState} from '@app/features/voice/engine/VoiceEffectiveAudioState';
import {getVoiceConnectionContextFromMediaEngine} from '@app/features/voice/engine/VoiceMediaEngineBridge';
import {
	getLocalSpeakingThresholdRms,
	getRemoteSpeakingThresholdRms,
} from '@app/features/voice/engine/VoiceSpeakingThreshold';
import type {VoiceEngineV2AppParticipantSnapshot} from '@app/features/voice/engine/v2/VoiceEngineV2AppSelectors';
import LocalVoiceState from '@app/features/voice/state/LocalVoiceState';
import ParticipantVolume from '@app/features/voice/state/ParticipantVolume';
import StreamAudioPrefs from '@app/features/voice/state/StreamAudioPrefs';
import VoiceSettings from '@app/features/voice/state/VoiceSettings';
import {type VoiceDeviceState, voiceDeviceManager} from '@app/features/voice/utils/VoiceDeviceManager';

const logger = new Logger('NativeVoiceDeviceSync');

export const NATIVE_VOICE_VOLUME_SYNC_PARTICIPANTS_MAX = 256;

const NATIVE_PARTICIPANT_GAIN_MAX = 2;

export {computeNativeParticipantVolume};

interface NativeVoiceStreamConnectionContext {
	guildId: string | null;
	channelId: string | null;
}

interface NativeVoiceDeviceSyncDeps {
	engine: VoiceEngine;
	getParticipants: () => Readonly<Record<string, VoiceEngineV2AppParticipantSnapshot>>;
	subscribeParticipants?: (listener: () => void) => () => void;
	getEffectiveDeaf?: () => boolean;
	getStreamConnectionContext?: () => NativeVoiceStreamConnectionContext;
	subscribeLocalVoiceState?: (listener: () => void) => () => void;
	subscribeDeviceState?: (listener: (state: VoiceDeviceState) => void) => () => void;
}

function defaultStreamConnectionContext(): NativeVoiceStreamConnectionContext {
	const context = getVoiceConnectionContextFromMediaEngine();
	return {guildId: context?.guildId ?? null, channelId: context?.channelId ?? null};
}

function releaseStaleOutputSelection(state: VoiceDeviceState): void {
	const outputDeviceId = VoiceSettings.getOutputDeviceId();
	if (!outputDeviceId || outputDeviceId === 'default') {
		return;
	}
	if (state.outputDevices.length === 0) {
		return;
	}
	const stillPresent = state.outputDevices.some((device) => device.deviceId === outputDeviceId);
	if (stillPresent) {
		return;
	}
	logger.warn('Selected audio output device no longer available; falling back to default', {
		deviceId: outputDeviceId,
	});
	VoiceSettings.updateSettings({outputDeviceId: 'default'});
}

function resolveStreamKey(
	context: NativeVoiceStreamConnectionContext,
	participant: VoiceEngineV2AppParticipantSnapshot,
): string | null {
	if (!participant.connectionId) return null;
	return getStreamKey(context.guildId, context.channelId, participant.connectionId);
}

function applyParticipantVolumes(
	engine: VoiceEngine,
	participants: Readonly<Record<string, VoiceEngineV2AppParticipantSnapshot>>,
	effectiveDeaf: boolean,
	streamContext: NativeVoiceStreamConnectionContext,
): void {
	assert.equal(typeof effectiveDeaf, 'boolean', 'effectiveDeaf must be a boolean');
	const outputVolumePercent = VoiceSettings.getOutputVolume();
	let participantCount = 0;
	for (const identity in participants) {
		const participant = participants[identity];
		if (!participant) continue;
		participantCount += 1;
		if (participantCount > NATIVE_VOICE_VOLUME_SYNC_PARTICIPANTS_MAX) {
			logger.error('Participant volume sync exceeds cap; truncating', {
				count: participantCount,
				cap: NATIVE_VOICE_VOLUME_SYNC_PARTICIPANTS_MAX,
			});
			break;
		}
		if (participant.isLocal) continue;
		if (!participant.sid || !participant.userId) continue;
		const streamKey = resolveStreamKey(streamContext, participant);
		const streamVolumePercent = streamKey ? StreamAudioPrefs.getVolume(streamKey) : undefined;
		const streamMuted = streamKey ? StreamAudioPrefs.isMuted(streamKey) : undefined;
		const volume = computeNativeParticipantVolume({
			userVolumePercent: ParticipantVolume.getVolume(participant.userId),
			outputVolumePercent,
			locallyMuted: ParticipantVolume.isLocalMuted(participant.userId),
			effectiveDeaf,
			streamVolumePercent,
			streamMuted,
		});
		assert.ok(volume >= 0, 'participant volume must be non-negative');
		assert.ok(volume <= NATIVE_PARTICIPANT_GAIN_MAX, 'participant volume must not exceed gain cap');
		if (effectiveDeaf) {
			assert.equal(volume, 0, 'deafened local user must push volume 0 for every participant');
		}
		void engine.setParticipantVolume(participant.sid, volume).catch((error) => {
			logger.warn('Native participant-volume sync failed', {sid: participant.sid, error});
		});
	}
}

function buildParticipantSidSnapshot(
	participants: Readonly<Record<string, VoiceEngineV2AppParticipantSnapshot>>,
): string {
	let snapshot = '';
	for (const identity in participants) {
		const sid = participants[identity]?.sid;
		if (!sid) continue;
		snapshot = snapshot ? `${snapshot},${sid}` : sid;
	}
	return snapshot;
}

export function bindNativeVoiceDeviceSync(deps: NativeVoiceDeviceSyncDeps): () => void {
	const {engine, getParticipants} = deps;
	const getEffectiveDeaf = deps.getEffectiveDeaf ?? (() => getEffectiveAudioState().effectiveDeaf);
	const getStreamConnectionContext = deps.getStreamConnectionContext ?? defaultStreamConnectionContext;
	const subscribeLocalVoiceState =
		deps.subscribeLocalVoiceState ?? ((listener: () => void) => LocalVoiceState.subscribe(listener));
	const subscribeDeviceState =
		deps.subscribeDeviceState ??
		((listener: (state: VoiceDeviceState) => void) => voiceDeviceManager.subscribe(listener));

	const applyOutputDevice = (deviceId: string): void => {
		if (!deviceId) return;
		void engine.setAudioOutputDevice(deviceId).catch((error) => {
			logger.warn('Native output-device sync failed', {deviceId, error});
		});
	};

	const applyVolumes = (): void => {
		applyParticipantVolumes(engine, getParticipants(), getEffectiveDeaf(), getStreamConnectionContext());
	};

	const applySpeakingDetection = (vadThreshold: number): void => {
		assert.ok(Number.isFinite(vadThreshold), 'vad threshold must be finite');
		void engine
			.setSpeakingDetection({
				localThresholdRms: getLocalSpeakingThresholdRms(vadThreshold),
				remoteThresholdRms: getRemoteSpeakingThresholdRms(vadThreshold),
			})
			.catch((error) => {
				logger.warn('Native speaking-detection sync failed', {error});
			});
	};

	applyOutputDevice(VoiceSettings.getOutputDeviceId());
	applyVolumes();
	applySpeakingDetection(VoiceSettings.getVadThreshold());

	let previousVadThreshold = VoiceSettings.getVadThreshold();
	const syncSpeakingDetection = () => {
		const vadThreshold = VoiceSettings.getVadThreshold();
		if (vadThreshold === previousVadThreshold) return;
		previousVadThreshold = vadThreshold;
		applySpeakingDetection(vadThreshold);
	};

	let previousOutputDeviceId = VoiceSettings.getOutputDeviceId();
	const getVolumeSnapshot = () => {
		const streamContext = getStreamConnectionContext();
		return {
			volumes: ParticipantVolume.volumes,
			mutes: ParticipantVolume.localMutes,
			outputVolume: VoiceSettings.getOutputVolume(),
			effectiveDeaf: getEffectiveDeaf(),
			participantSids: buildParticipantSidSnapshot(getParticipants()),
			streamGuildId: streamContext.guildId,
			streamChannelId: streamContext.channelId,
			streamPrefsRevision: StreamAudioPrefs.audioPrefsRevision,
		};
	};
	let previousVolumeSnapshot = getVolumeSnapshot();
	const syncOutputDevice = () => {
		const deviceId = VoiceSettings.getOutputDeviceId();
		if (deviceId === previousOutputDeviceId) return;
		previousOutputDeviceId = deviceId;
		applyOutputDevice(deviceId);
	};
	const syncVolumes = () => {
		const current = getVolumeSnapshot();
		if (
			current.volumes === previousVolumeSnapshot.volumes &&
			current.mutes === previousVolumeSnapshot.mutes &&
			current.outputVolume === previousVolumeSnapshot.outputVolume &&
			current.effectiveDeaf === previousVolumeSnapshot.effectiveDeaf &&
			current.participantSids === previousVolumeSnapshot.participantSids &&
			current.streamGuildId === previousVolumeSnapshot.streamGuildId &&
			current.streamChannelId === previousVolumeSnapshot.streamChannelId &&
			current.streamPrefsRevision === previousVolumeSnapshot.streamPrefsRevision
		) {
			return;
		}
		previousVolumeSnapshot = current;
		applyVolumes();
	};
	const settingsDisposer = VoiceSettings.subscribe(() => {
		syncOutputDevice();
		syncVolumes();
		syncSpeakingDetection();
	});
	const volumeDisposer = ParticipantVolume.subscribe(syncVolumes);
	const streamPrefsDisposer = StreamAudioPrefs.subscribe(syncVolumes);
	const localVoiceStateDisposer = subscribeLocalVoiceState(syncVolumes);
	const participantDisposer = deps.subscribeParticipants?.(syncVolumes) ?? (() => {});
	const deviceStateDisposer = subscribeDeviceState(releaseStaleOutputSelection);

	return () => {
		settingsDisposer();
		volumeDisposer();
		streamPrefsDisposer();
		localVoiceStateDisposer();
		participantDisposer();
		deviceStateDisposer();
	};
}
