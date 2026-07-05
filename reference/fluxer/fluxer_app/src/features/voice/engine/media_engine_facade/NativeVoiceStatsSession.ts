// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';
import {Logger} from '@app/features/platform/utils/AppLogger';
import Users from '@app/features/user/state/Users';
import {requireNativeVoiceEngine} from '@app/features/voice/engine/native_voice_engine/getVoiceEngine';
import NativeVoiceStatsStore from '@app/features/voice/engine/native_voice_engine/NativeVoiceStatsStore';
import {voiceMediaGraphStatsObservationsFromNativeStats} from '@app/features/voice/engine/VoiceMediaGraphStats';
import voiceMediaGraphStore from '@app/features/voice/engine/VoiceMediaGraphStore';
import voiceEngineV2AppConnectionHostAdapter from '@app/features/voice/engine/v2/VoiceEngineV2AppConnectionHostAdapter';
import {buildVoiceParticipantIdentity} from '@app/features/voice/utils/VoiceParticipantIdentity';
import type {VoiceEngineV2Stats} from '@fluxer/voice_engine_v2';

const logger = new Logger('NativeVoiceStatsSession');
const NATIVE_VOICE_STATS_POLL_INTERVAL_MS = 1000;

export interface NativeVoiceStatsSessionDeps {
	ingestStats(stats: VoiceEngineV2Stats, timestampMs: number): void;
}

export class NativeVoiceStatsSession {
	private readonly deps: NativeVoiceStatsSessionDeps;
	private pollIntervalId: number | null = null;
	private pollInFlight = false;
	private publishedConnectionId: string | null = null;

	constructor(deps: NativeVoiceStatsSessionDeps) {
		assert.ok(deps, 'native voice stats session deps are required');
		assert.equal(typeof deps.ingestStats, 'function', 'native voice stats session requires an ingest callback');
		this.deps = deps;
	}

	private stopPolling(): void {
		if (this.pollIntervalId !== null) {
			window.clearInterval(this.pollIntervalId);
			this.pollIntervalId = null;
		}
		this.pollInFlight = false;
	}

	private resolveLocalParticipantIdentity(connectionId: string): string | null {
		const currentUserId = Users.getCurrentUser()?.id;
		if (!currentUserId) return null;
		return buildVoiceParticipantIdentity(currentUserId, connectionId);
	}

	private publishGraphStats(stats: VoiceEngineV2Stats, connectionId: string, timestampMs: number): void {
		if (this.publishedConnectionId !== connectionId) {
			this.publishedConnectionId = connectionId;
			voiceMediaGraphStore.transition({type: 'stats.connectionChanged', connectionId});
		}
		voiceMediaGraphStore.transition({
			type: 'stats.observed',
			at: timestampMs,
			connectionId,
			platform: 'native',
			tracks: voiceMediaGraphStatsObservationsFromNativeStats(
				stats,
				this.resolveLocalParticipantIdentity(connectionId),
			),
		});
	}

	private clearGraphStats(): void {
		if (this.publishedConnectionId === null) return;
		this.publishedConnectionId = null;
		voiceMediaGraphStore.transition({type: 'stats.connectionChanged', connectionId: null});
	}

	private poll(): void {
		NativeVoiceStatsStore.tick(voiceMediaGraphStore.nowMs());
		if (this.pollInFlight) return;
		const connectionId = voiceEngineV2AppConnectionHostAdapter.connectionId;
		if (!voiceEngineV2AppConnectionHostAdapter.connected || !connectionId) return;
		NativeVoiceStatsStore.setConnectionId(connectionId);
		this.pollInFlight = true;
		const timestamp = voiceMediaGraphStore.nowMs();
		void requireNativeVoiceEngine()
			.getConnectionStats()
			.then((stats) => {
				if (
					!voiceEngineV2AppConnectionHostAdapter.connected ||
					voiceEngineV2AppConnectionHostAdapter.connectionId !== connectionId
				)
					return;
				if (stats) {
					this.deps.ingestStats(stats, timestamp);
					this.publishGraphStats(stats, connectionId, timestamp);
				} else {
					NativeVoiceStatsStore.tick(timestamp);
				}
			})
			.catch((error) => {
				logger.warn('Native voice engine stats poll failed', {error});
			})
			.finally(() => {
				this.pollInFlight = false;
			});
	}

	stop(clearStats: boolean = true): void {
		this.stopPolling();
		if (clearStats) {
			NativeVoiceStatsStore.clear();
			this.clearGraphStats();
		}
	}

	start(): void {
		this.stop(false);
		NativeVoiceStatsStore.startSession(voiceMediaGraphStore.nowMs());
		this.poll();
		this.pollIntervalId = window.setInterval(() => {
			this.poll();
		}, NATIVE_VOICE_STATS_POLL_INTERVAL_MS);
	}
}
