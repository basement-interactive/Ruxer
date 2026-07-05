// SPDX-License-Identifier: AGPL-3.0-or-later

import * as VoiceCallLayoutCommands from '@app/features/voice/commands/VoiceCallLayoutCommands';
import {getStreamKey, parseStreamKey} from '@app/features/voice/components/StreamKeys';
import {
	syncLocalVoiceStateWithServer,
	syncVoiceEngineV2WatchedStreamKeys,
} from '@app/features/voice/engine/VoiceMediaEngineBridge';
import {
	normalizeVoiceMediaGraphViewerStreamKeys,
	selectVoiceMediaGraphDeferredStopKeys,
	selectVoiceMediaGraphViewerStreamKeys,
	type VoiceMediaGraphSnapshot,
	type VoiceMediaGraphWatchIntentEvent,
} from '@app/features/voice/engine/VoiceMediaGraph';
import {voiceMediaGraphStore} from '@app/features/voice/engine/VoiceMediaGraphStore';
import {VoiceTrackSource} from '@app/features/voice/engine/VoiceTrackSource';
import LocalVoiceState from '@app/features/voice/state/LocalVoiceState';
import {ScreenShareWatchFailures} from '@app/features/voice/state/ScreenShareWatchFailures';
import VoiceCallLayout from '@app/features/voice/state/VoiceCallLayout';
import {parseVoiceParticipantIdentity} from '@app/features/voice/utils/VoiceParticipantIdentity';
import {ME} from '@fluxer/constants/src/AppConstants';

interface StopWatchingStreamKeyOptions {
	guildId?: string | null;
	channelId?: string | null;
	clearPinned?: boolean;
	sync?: boolean;
}

const deferredStopOptionsByStreamKey = new Map<string, StopWatchingStreamKeyOptions>();
let lastProjectedGraphKeys: Array<string> | null = null;
let suppressGraphProjection = false;

interface PruneInactiveWatchedStreamsOptions {
	guildId?: string | null;
	channelId: string;
	isStreamActive: (connectionId: string) => boolean;
}

export interface WatchTransitionResult {
	previousKeys: Array<string>;
	keys: Array<string>;
	addedKeys: Array<string>;
	removedKeys: Array<string>;
	changed: boolean;
	membershipChanged: boolean;
	hadStreams: boolean;
	hasStreams: boolean;
	deferredStopKeys: ReadonlySet<string>;
}

export function normalizeStreamGuildId(guildId: string | null | undefined): string | null {
	if (!guildId || guildId === ME) return null;
	return guildId;
}

export function getStreamKeyForParticipantIdentity(
	guildId: string | null | undefined,
	channelId: string | null | undefined,
	participantIdentity: string,
): string | null {
	const {connectionId} = parseVoiceParticipantIdentity(participantIdentity);
	if (!connectionId || !channelId) return null;
	return getStreamKey(normalizeStreamGuildId(guildId), channelId, connectionId);
}

function getPinnedScreenShareStreamKey(
	guildId: string | null | undefined,
	channelId: string | null | undefined,
): string | null {
	if (!channelId) return null;
	if (VoiceCallLayout.pinnedParticipantSource !== VoiceTrackSource.ScreenShare) return null;
	const pinnedIdentity = VoiceCallLayout.pinnedParticipantIdentity;
	if (!pinnedIdentity) return null;
	return getStreamKeyForParticipantIdentity(guildId, channelId, pinnedIdentity);
}

function clearPinnedScreenShareIfMatches(
	streamKey: string,
	guildId: string | null | undefined,
	channelId: string | null | undefined,
): void {
	if (getPinnedScreenShareStreamKey(guildId, channelId) !== streamKey) return;
	VoiceCallLayoutCommands.setPinnedParticipant(null);
}

function arrayDifference(left: ReadonlyArray<string>, right: ReadonlyArray<string>): Array<string> {
	const rightSet = new Set(right);
	return left.filter((key) => !rightSet.has(key));
}

function streamKeyArraysEqual(left: ReadonlyArray<string>, right: ReadonlyArray<string>): boolean {
	if (left.length !== right.length) return false;
	return left.every((key, index) => key === right[index]);
}

function pruneDeferredStopOptions(deferredStopKeys: ReadonlySet<string>): void {
	for (const streamKey of Array.from(deferredStopOptionsByStreamKey.keys())) {
		if (deferredStopKeys.has(streamKey)) continue;
		deferredStopOptionsByStreamKey.delete(streamKey);
	}
}

function dispatchWatchIntentEvent(event: VoiceMediaGraphWatchIntentEvent): void {
	suppressGraphProjection = true;
	try {
		voiceMediaGraphStore.transition(event);
	} finally {
		suppressGraphProjection = false;
	}
}

function hydrateGraphWatchIntentFromLocalProjection(): void {
	const graphKeys = selectVoiceMediaGraphViewerStreamKeys(voiceMediaGraphStore.getGraphSnapshot());
	if (graphKeys.length > 0) return;
	const localKeys = normalizeVoiceMediaGraphViewerStreamKeys(LocalVoiceState.getViewerStreamKeys());
	if (localKeys.length === 0) return;
	dispatchWatchIntentEvent({type: 'watchIntent.replace', keys: localKeys});
}

function transitionWatchState(event: VoiceMediaGraphWatchIntentEvent): WatchTransitionResult {
	const previousProjectionKeys = LocalVoiceState.getViewerStreamKeys();
	hydrateGraphWatchIntentFromLocalProjection();
	const previousNormalizedKeys = [...selectVoiceMediaGraphViewerStreamKeys(voiceMediaGraphStore.getGraphSnapshot())];
	dispatchWatchIntentEvent(event);
	const graphSnapshot = voiceMediaGraphStore.getGraphSnapshot();
	const keys = [...selectVoiceMediaGraphViewerStreamKeys(graphSnapshot)];
	lastProjectedGraphKeys = keys;
	const membershipChanged = !streamKeyArraysEqual(previousNormalizedKeys, keys);
	const changed = !streamKeyArraysEqual(previousProjectionKeys, keys);
	if (changed) {
		LocalVoiceState.updateViewerStreamKeys(keys);
		syncVoiceEngineV2WatchedStreamKeys(keys);
	}
	const deferredStopKeys = selectVoiceMediaGraphDeferredStopKeys(graphSnapshot);
	pruneDeferredStopOptions(deferredStopKeys);
	return {
		previousKeys: previousNormalizedKeys,
		keys,
		addedKeys: arrayDifference(keys, previousNormalizedKeys),
		removedKeys: arrayDifference(previousNormalizedKeys, keys),
		changed,
		membershipChanged,
		hadStreams: previousNormalizedKeys.length > 0,
		hasStreams: keys.length > 0,
		deferredStopKeys,
	};
}

function finalizeExternalWatchIntentChange(
	previousProjectionKeys: ReadonlyArray<string>,
	keys: Array<string>,
	graphSnapshot: VoiceMediaGraphSnapshot,
): void {
	const changed = !streamKeyArraysEqual(previousProjectionKeys, keys);
	if (changed) {
		LocalVoiceState.updateViewerStreamKeys(keys);
		syncVoiceEngineV2WatchedStreamKeys(keys);
	}
	let shouldSyncServer = false;
	for (const streamKey of arrayDifference(keys, previousProjectionKeys)) {
		ScreenShareWatchFailures.markWatchStarted(streamKey);
		shouldSyncServer = true;
	}
	for (const streamKey of arrayDifference(previousProjectionKeys, keys)) {
		const options = deferredStopOptionsByStreamKey.get(streamKey) ?? {};
		deferredStopOptionsByStreamKey.delete(streamKey);
		ScreenShareWatchFailures.markWatchStopped(streamKey);
		if (options.clearPinned ?? true) {
			clearPinnedScreenShareIfMatches(streamKey, options.guildId ?? null, options.channelId ?? null);
		}
		if (options.sync ?? true) {
			shouldSyncServer = true;
		}
	}
	if (changed && shouldSyncServer) {
		syncLocalVoiceStateWithServer({viewer_stream_keys: keys});
	}
	pruneDeferredStopOptions(selectVoiceMediaGraphDeferredStopKeys(graphSnapshot));
}

function projectWatchIntentFromGraphTransition(): void {
	if (suppressGraphProjection) return;
	if (lastProjectedGraphKeys === null) return;
	const graphSnapshot = voiceMediaGraphStore.getGraphSnapshot();
	const keys = [...selectVoiceMediaGraphViewerStreamKeys(graphSnapshot)];
	if (streamKeyArraysEqual(lastProjectedGraphKeys, keys)) return;
	const previousProjectionKeys = LocalVoiceState.getViewerStreamKeys();
	lastProjectedGraphKeys = keys;
	suppressGraphProjection = true;
	try {
		finalizeExternalWatchIntentChange(previousProjectionKeys, keys, graphSnapshot);
	} finally {
		suppressGraphProjection = false;
	}
}

function syncWatchedKeysIfChanged(result: WatchTransitionResult, sync: boolean): void {
	if (!sync || !result.changed) return;
	syncLocalVoiceStateWithServer({viewer_stream_keys: result.keys});
}

function syncWatchAttemptState(result: WatchTransitionResult): void {
	if (!result.membershipChanged) return;
	for (const streamKey of result.addedKeys) {
		ScreenShareWatchFailures.markWatchStarted(streamKey);
	}
	for (const streamKey of result.removedKeys) {
		ScreenShareWatchFailures.markWatchStopped(streamKey);
	}
}

export function replaceWatchedStreamKeys(
	keys: ReadonlyArray<string>,
	options: Pick<StopWatchingStreamKeyOptions, 'sync'> = {},
): WatchTransitionResult {
	const result = transitionWatchState({type: 'watchIntent.replace', keys});
	syncWatchAttemptState(result);
	syncWatchedKeysIfChanged(result, options.sync ?? true);
	return result;
}

export function addWatchedStreamKey(
	streamKey: string,
	options: Pick<StopWatchingStreamKeyOptions, 'sync'> = {},
): WatchTransitionResult {
	const result = transitionWatchState({type: 'watchIntent.add', key: streamKey});
	syncWatchAttemptState(result);
	syncWatchedKeysIfChanged(result, options.sync ?? true);
	return result;
}

export function stopWatchingStreamKey(streamKey: string, options: StopWatchingStreamKeyOptions = {}): boolean {
	const {guildId = null, channelId = null, clearPinned = true, sync = true} = options;
	const result = transitionWatchState({type: 'watchIntent.remove', key: streamKey});
	syncWatchAttemptState(result);
	syncWatchedKeysIfChanged(result, sync);
	if (!result.membershipChanged) return false;
	if (clearPinned) {
		clearPinnedScreenShareIfMatches(streamKey, guildId, channelId);
	}
	return true;
}

export function deferStopWatchingStreamKey(streamKey: string, options: StopWatchingStreamKeyOptions = {}): void {
	const result = transitionWatchState({
		type: 'watchIntent.deferRemove',
		key: streamKey,
		at: voiceMediaGraphStore.nowMs(),
	});
	if (!result.deferredStopKeys.has(streamKey)) return;
	deferredStopOptionsByStreamKey.set(streamKey, options);
}

export function cancelDeferredStopWatchingStreamKey(streamKey: string): boolean {
	const wasDeferred = selectVoiceMediaGraphDeferredStopKeys(voiceMediaGraphStore.getGraphSnapshot()).has(streamKey);
	deferredStopOptionsByStreamKey.delete(streamKey);
	const result = transitionWatchState({type: 'watchIntent.cancelDeferredRemove', key: streamKey});
	return wasDeferred || result.deferredStopKeys.has(streamKey);
}

export function pruneInactiveWatchedStreamsForChannel({
	guildId,
	channelId,
	isStreamActive,
}: PruneInactiveWatchedStreamsOptions): Array<string> {
	const normalizedGuildId = normalizeStreamGuildId(guildId);
	hydrateGraphWatchIntentFromLocalProjection();
	const current = selectVoiceMediaGraphViewerStreamKeys(voiceMediaGraphStore.getGraphSnapshot());
	if (current.length === 0) return [];
	const removed: Array<string> = [];
	for (const streamKey of current) {
		const parsed = parseStreamKey(streamKey);
		if (!parsed) continue;
		if (parsed.channelId !== channelId || parsed.guildId !== normalizedGuildId) continue;
		if (isStreamActive(parsed.connectionId)) continue;
		removed.push(streamKey);
	}
	if (removed.length === 0) return [];
	const result = transitionWatchState({type: 'watchIntent.removeMany', keys: removed});
	syncWatchAttemptState(result);
	syncWatchedKeysIfChanged(result, true);
	if (!result.membershipChanged) return [];
	for (const streamKey of removed) {
		clearPinnedScreenShareIfMatches(streamKey, normalizedGuildId, channelId);
	}
	return result.removedKeys;
}

voiceMediaGraphStore.subscribe(projectWatchIntentFromGraphTransition);
