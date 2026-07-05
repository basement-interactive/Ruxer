// SPDX-License-Identifier: AGPL-3.0-or-later

import {describe, expect, it} from 'vitest';
import {
	runVoiceEngineV2AdmWarmup,
	VOICE_ENGINE_V2_ADM_WARMUP_POLL_ATTEMPTS_MAX,
	VOICE_ENGINE_V2_ADM_WARMUP_POLL_INTERVAL_MS,
} from './admWarmup';

describe('runVoiceEngineV2AdmWarmup', () => {
	it('resolves ready when the first probe succeeds', async () => {
		let probeCalls = 0;
		const state = await runVoiceEngineV2AdmWarmup({
			probe: async () => {
				probeCalls += 1;
				return true;
			},
			delay: async () => {},
		});
		expect(state).toEqual({status: 'ready'});
		expect(probeCalls).toBe(1);
	});

	it('polls at the fixed cadence until the probe reports ready', async () => {
		let probeCalls = 0;
		const delays: Array<number> = [];
		const state = await runVoiceEngineV2AdmWarmup({
			probe: async () => {
				probeCalls += 1;
				return probeCalls >= 5;
			},
			delay: async (durationMs) => {
				delays.push(durationMs);
			},
		});
		expect(state).toEqual({status: 'ready'});
		expect(probeCalls).toBe(5);
		expect(delays.every((durationMs) => durationMs === VOICE_ENGINE_V2_ADM_WARMUP_POLL_INTERVAL_MS)).toBe(true);
	});

	it('fails after the bounded attempt count when the probe never reports ready', async () => {
		let probeCalls = 0;
		const state = await runVoiceEngineV2AdmWarmup({
			probe: async () => {
				probeCalls += 1;
				return false;
			},
			delay: async () => {},
		});
		expect(state.status).toBe('failed');
		expect(state.detail).toContain('deadline');
		expect(probeCalls).toBe(VOICE_ENGINE_V2_ADM_WARMUP_POLL_ATTEMPTS_MAX);
	});

	it('fails with the probe error detail when the probe throws', async () => {
		let probeCalls = 0;
		const state = await runVoiceEngineV2AdmWarmup({
			probe: async () => {
				probeCalls += 1;
				throw new Error('addon exploded');
			},
			delay: async () => {},
		});
		expect(state.status).toBe('failed');
		expect(state.detail).toContain('addon exploded');
		expect(probeCalls).toBe(1);
	});

	it('fails at the deadline without stacking probes when the probe hangs forever', async () => {
		let probeCalls = 0;
		const state = await runVoiceEngineV2AdmWarmup({
			probe: () => {
				probeCalls += 1;
				return new Promise<boolean>(() => {});
			},
			delay: async () => {},
		});
		expect(state.status).toBe('failed');
		expect(state.detail).toContain('deadline');
		expect(probeCalls).toBe(1);
	});

	it('resolves ready when a slow probe settles after several poll intervals', async () => {
		let probeCalls = 0;
		let resolveProbe: ((ready: boolean) => void) | null = null;
		let delayCalls = 0;
		const state = await runVoiceEngineV2AdmWarmup({
			probe: () => {
				probeCalls += 1;
				return new Promise<boolean>((resolve) => {
					resolveProbe = resolve;
				});
			},
			delay: async () => {
				delayCalls += 1;
				if (delayCalls === 3) {
					resolveProbe?.(true);
				}
			},
		});
		expect(state).toEqual({status: 'ready'});
		expect(probeCalls).toBe(1);
	});
});
