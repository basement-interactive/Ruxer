// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	createVoiceLatencySnapshot,
	observeVoiceLatencyGap,
	recordVoiceLatencySample,
	startVoiceLatencyTracking,
	stopVoiceLatencyTracking,
} from '@app/features/voice/engine/VoiceLatencyTracker';
import {describe, expect, it} from 'vitest';

describe('VoiceLatencyTracker', () => {
	it('records samples, caps history, and computes an average', () => {
		let latency = startVoiceLatencyTracking(createVoiceLatencySnapshot(), 1000);
		latency = recordVoiceLatencySample(latency, 1100, 12.4, {historyLimit: 2});
		latency = recordVoiceLatencySample(latency, 1200, 20.6, {historyLimit: 2});
		latency = recordVoiceLatencySample(latency, 1300, 31.2, {historyLimit: 2});

		expect(latency.status).toBe('fresh');
		expect(latency.currentLatency).toBe(31);
		expect(latency.averageLatency).toBe(26);
		expect(latency.latencyHistory).toEqual([
			{timestamp: 1200, latency: 21},
			{timestamp: 1300, latency: 31},
		]);
	});

	it('treats missing samples as observation gaps instead of clearing the last measurement', () => {
		let latency = startVoiceLatencyTracking(createVoiceLatencySnapshot(), 1000);
		latency = recordVoiceLatencySample(latency, 1100, 24);
		latency = observeVoiceLatencyGap(latency, 1500);

		expect(latency.status).toBe('fresh');
		expect(latency.currentLatency).toBe(24);
		expect(latency.averageLatency).toBe(24);
		expect(latency.latencyHistory).toEqual([{timestamp: 1100, latency: 24}]);
	});

	it('marks old measurements stale without erasing their value', () => {
		let latency = startVoiceLatencyTracking(createVoiceLatencySnapshot(), 1000);
		latency = recordVoiceLatencySample(latency, 1100, 24, {staleAfterMs: 1000});
		latency = observeVoiceLatencyGap(latency, 2201, {staleAfterMs: 1000});

		expect(latency.status).toBe('stale');
		expect(latency.currentLatency).toBe(24);
	});

	it('keeps stopped tracking idle while retaining the last value until reset', () => {
		let latency = startVoiceLatencyTracking(createVoiceLatencySnapshot(), 1000);
		latency = recordVoiceLatencySample(latency, 1100, 24);
		latency = stopVoiceLatencyTracking(latency, 1200);

		expect(latency.status).toBe('idle');
		expect(latency.currentLatency).toBe(24);
	});
});
