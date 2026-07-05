// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	mapNativeStatsToOverrides,
	mapNativeStatsToPerTrackStats,
} from '@app/features/voice/engine/native_voice_engine/nativeVoiceStatsMapper';
import {Store} from '@app/features/voice/engine/Store';
import {
	createVoiceLatencySnapshot,
	type LatencyDataPoint,
	observeVoiceLatencyGap,
	recordVoiceLatencySample,
	resetVoiceLatencySnapshot,
	startVoiceLatencyTracking,
	type VoiceLatencySnapshot,
	type VoiceLatencyStatus,
} from '@app/features/voice/engine/VoiceLatencyTracker';
import {createInitialVoiceStats} from '@app/features/voice/engine/VoiceStatsStateMachine';
import type {
	VoiceEngineV2PerTrackStats,
	VoiceEngineV2Stats,
	VoiceEngineV2StatsSample,
	VoiceEngineV2VoiceStats,
} from '@fluxer/voice_engine_v2';

interface NativeVoiceStatsStoreSetStatsOptions {
	connectionId?: string | null;
	mergeSparseTrackStats?: boolean;
}

interface NativeVoiceStatsStoreVoiceStatsOptions {
	participantCount?: number;
}

function mergeNativeVoiceStats(
	previous: VoiceEngineV2Stats | null,
	stats: VoiceEngineV2Stats,
	options: NativeVoiceStatsStoreSetStatsOptions,
): VoiceEngineV2Stats {
	const preserveOutbound =
		options.mergeSparseTrackStats === true && stats.outbound.length === 0 && (previous?.outbound.length ?? 0) > 0;
	const preserveInbound =
		options.mergeSparseTrackStats === true && stats.inbound.length === 0 && (previous?.inbound.length ?? 0) > 0;
	return {
		...stats,
		outbound: preserveOutbound ? (previous?.outbound ?? []) : stats.outbound,
		inbound: preserveInbound ? (previous?.inbound ?? []) : stats.inbound,
		droppedVideoFrameCallbacks: stats.droppedVideoFrameCallbacks ?? previous?.droppedVideoFrameCallbacks,
		droppedNativeVideoFrames: stats.droppedNativeVideoFrames ?? previous?.droppedNativeVideoFrames,
		send: stats.send === undefined ? previous?.send : stats.send,
	};
}

function nativeStatsToVoiceStats(
	stats: VoiceEngineV2Stats | null,
	duration: number,
	currentLatency: number | null,
	participantCount: number,
): VoiceEngineV2VoiceStats {
	const initial = createInitialVoiceStats();
	if (!stats) return {...initial, duration, participantCount};
	const overrides = mapNativeStatsToOverrides(stats);
	return {
		audioSendBitrate: overrides.network.audioSendBitrateKbps,
		audioRecvBitrate: overrides.network.audioRecvBitrateKbps,
		videoSendBitrate: overrides.network.videoSendBitrateKbps,
		videoRecvBitrate: overrides.network.videoRecvBitrateKbps,
		audioPacketLoss: overrides.network.audioPacketLossPercent,
		videoPacketLoss: overrides.network.videoPacketLossPercent,
		rtt: currentLatency ?? overrides.network.rttMs ?? 0,
		jitter: overrides.network.jitterMs,
		participantCount,
		duration,
	};
}

function appendNativeStatsSample(
	timeSeries: ReadonlyArray<VoiceEngineV2StatsSample>,
	sample: VoiceEngineV2StatsSample,
	limit: number,
): Array<VoiceEngineV2StatsSample> {
	if (limit <= 0) return [];
	const retainedCount = Math.min(timeSeries.length, limit - 1);
	const nextTimeSeries = new Array<VoiceEngineV2StatsSample>(retainedCount + 1);
	const startIndex = timeSeries.length - retainedCount;
	for (let i = 0; i < retainedCount; i += 1) {
		nextTimeSeries[i] = timeSeries[startIndex + i];
	}
	nextTimeSeries[retainedCount] = sample;
	return nextTimeSeries;
}

function replaceLastNativeStatsSample(
	timeSeries: ReadonlyArray<VoiceEngineV2StatsSample>,
	sample: VoiceEngineV2StatsSample,
): Array<VoiceEngineV2StatsSample> {
	if (timeSeries.length === 0) return [sample];
	const nextTimeSeries = new Array<VoiceEngineV2StatsSample>(timeSeries.length);
	for (let i = 0; i < timeSeries.length - 1; i += 1) {
		nextTimeSeries[i] = timeSeries[i];
	}
	nextTimeSeries[timeSeries.length - 1] = sample;
	return nextTimeSeries;
}

class NativeVoiceStatsStore extends Store {
	private _stats: VoiceEngineV2Stats | null = null;
	private _connectionId: string | null = null;
	private _latency: VoiceLatencySnapshot = createVoiceLatencySnapshot();
	private _sessionStartedAt: number | null = null;
	private _clockNow: number = Date.now();
	private _statsTimeSeries: Array<VoiceEngineV2StatsSample> = [];

	get stats(): VoiceEngineV2Stats | null {
		return this._stats;
	}

	get connectionId(): string | null {
		return this._connectionId;
	}

	get currentLatency(): number | null {
		return this._latency.currentLatency;
	}

	get averageLatency(): number | null {
		return this._latency.averageLatency;
	}

	get latencyHistory(): Array<LatencyDataPoint> {
		return this._latency.latencyHistory;
	}

	get latencyStatus(): VoiceLatencyStatus {
		return this._latency.status;
	}

	get duration(): number {
		return this._sessionStartedAt ? Math.floor((this._clockNow - this._sessionStartedAt) / 1000) : 0;
	}

	get statsTimeSeries(): Array<VoiceEngineV2StatsSample> {
		return this._statsTimeSeries;
	}

	get perTrackStats(): Array<VoiceEngineV2PerTrackStats> {
		return this._stats ? mapNativeStatsToPerTrackStats(this._stats) : [];
	}

	getVoiceStats(options: NativeVoiceStatsStoreVoiceStatsOptions = {}): VoiceEngineV2VoiceStats {
		return nativeStatsToVoiceStats(this._stats, this.duration, this.currentLatency, options.participantCount ?? 0);
	}

	startSession(now: number = Date.now()): void {
		this.update(() => {
			this._sessionStartedAt = now;
			this._clockNow = now;
			this._latency = resetVoiceLatencySnapshot({tracking: true, now});
			this._stats = null;
			this._statsTimeSeries = [];
		});
	}

	tick(timestamp: number = Date.now()): void {
		this.update(() => {
			this._clockNow = timestamp;
			if (this._sessionStartedAt != null) {
				this._latency = observeVoiceLatencyGap(this._latency, timestamp);
			}
		});
	}

	setConnectionId(connectionId: string | null): void {
		if (this._connectionId === connectionId) return;
		this.update(() => {
			this._connectionId = connectionId;
			this._stats = null;
		});
	}

	setStats(
		stats: VoiceEngineV2Stats | null,
		timestamp: number = Date.now(),
		options: NativeVoiceStatsStoreSetStatsOptions = {},
	): void {
		if (options.connectionId !== undefined) {
			if (this._connectionId !== null && options.connectionId !== this._connectionId) return;
		}
		this.update(() => {
			if (options.connectionId !== undefined && this._connectionId === null) {
				this._connectionId = options.connectionId;
			}
			this._clockNow = timestamp;
			this._stats = stats ? mergeNativeVoiceStats(this._stats, stats, options) : stats;
			const latency =
				stats && !this._latency.tracking ? startVoiceLatencyTracking(this._latency, timestamp) : this._latency;
			this._latency =
				stats && typeof stats.rttMs === 'number'
					? recordVoiceLatencySample(latency, timestamp, stats.rttMs)
					: observeVoiceLatencyGap(latency, timestamp);
			if (stats && this._sessionStartedAt == null) {
				this._sessionStartedAt = timestamp;
			}
			if (this._stats) {
				const overrides = mapNativeStatsToOverrides(this._stats);
				const sample: VoiceEngineV2StatsSample = {
					timestamp,
					rtt: this.currentLatency ?? this._stats.rttMs ?? 0,
					jitter: overrides.network.jitterMs,
					audioPacketLoss: overrides.network.audioPacketLossPercent,
					videoPacketLoss: overrides.network.videoPacketLossPercent,
					audioSendBitrate: overrides.network.audioSendBitrateKbps,
					audioRecvBitrate: overrides.network.audioRecvBitrateKbps,
					videoSendBitrate: overrides.network.videoSendBitrateKbps,
					videoRecvBitrate: overrides.network.videoRecvBitrateKbps,
				};
				const previous = this._statsTimeSeries.at(-1);
				if (previous && Math.floor(previous.timestamp / 1000) === Math.floor(timestamp / 1000)) {
					this._statsTimeSeries = replaceLastNativeStatsSample(this._statsTimeSeries, sample);
				} else {
					this._statsTimeSeries = appendNativeStatsSample(this._statsTimeSeries, sample, 60);
				}
			}
		});
	}

	clear(): void {
		if (
			this._stats == null &&
			this._connectionId == null &&
			this._latency.latencyHistory.length === 0 &&
			this._sessionStartedAt == null &&
			this._statsTimeSeries.length === 0
		) {
			return;
		}
		this.update(() => {
			this._stats = null;
			this._connectionId = null;
			this._latency = resetVoiceLatencySnapshot();
			this._sessionStartedAt = null;
			this._clockNow = Date.now();
			this._statsTimeSeries = [];
		});
	}
}

const instance = new NativeVoiceStatsStore();

export default instance;
export {NativeVoiceStatsStore};
