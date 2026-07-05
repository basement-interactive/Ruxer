// SPDX-License-Identifier: AGPL-3.0-or-later

import type {VoiceEngineV2BridgeAudioDeviceModuleState} from './types';

export const VOICE_ENGINE_V2_ADM_WARMUP_POLL_INTERVAL_MS = 250;
export const VOICE_ENGINE_V2_ADM_WARMUP_DEADLINE_MS = 60_000;
export const VOICE_ENGINE_V2_ADM_WARMUP_POLL_ATTEMPTS_MAX = Math.floor(
	VOICE_ENGINE_V2_ADM_WARMUP_DEADLINE_MS / VOICE_ENGINE_V2_ADM_WARMUP_POLL_INTERVAL_MS,
);

export interface VoiceEngineV2AdmWarmupPorts {
	probe(): Promise<boolean>;
	delay(durationMs: number): Promise<void>;
}

type AdmProbeOutcome = {kind: 'ready'; ready: boolean} | {kind: 'error'; detail: string};

const ADM_PROBE_STILL_PENDING = Symbol('voice-engine-v2-adm-probe-still-pending');

function startBoundedAdmProbe(ports: VoiceEngineV2AdmWarmupPorts): Promise<AdmProbeOutcome> {
	return ports.probe().then(
		(ready) => ({kind: 'ready', ready}),
		(error) => {
			const detail = error instanceof Error ? error.message : String(error);
			return {kind: 'error', detail: `audio device module probe failed: ${detail}`};
		},
	);
}

export async function runVoiceEngineV2AdmWarmup(
	ports: VoiceEngineV2AdmWarmupPorts,
): Promise<VoiceEngineV2BridgeAudioDeviceModuleState> {
	if (VOICE_ENGINE_V2_ADM_WARMUP_POLL_ATTEMPTS_MAX < 1) {
		throw new Error('ADM warmup poll attempt bound must be at least 1');
	}
	let pendingProbe: Promise<AdmProbeOutcome> | null = null;
	for (let attempt = 1; attempt <= VOICE_ENGINE_V2_ADM_WARMUP_POLL_ATTEMPTS_MAX; attempt++) {
		if (pendingProbe === null) {
			pendingProbe = startBoundedAdmProbe(ports);
		}
		const attemptTimeout = ports.delay(VOICE_ENGINE_V2_ADM_WARMUP_POLL_INTERVAL_MS).then(() => ADM_PROBE_STILL_PENDING);
		const outcome = await Promise.race([pendingProbe, attemptTimeout]);
		if (outcome === ADM_PROBE_STILL_PENDING) {
			continue;
		}
		pendingProbe = null;
		const probeOutcome = outcome as AdmProbeOutcome;
		if (probeOutcome.kind === 'error') {
			return {status: 'failed', detail: probeOutcome.detail};
		}
		if (probeOutcome.ready) {
			return {status: 'ready'};
		}
		if (attempt < VOICE_ENGINE_V2_ADM_WARMUP_POLL_ATTEMPTS_MAX) {
			await ports.delay(VOICE_ENGINE_V2_ADM_WARMUP_POLL_INTERVAL_MS);
		}
	}
	return {
		status: 'failed',
		detail: `audio device module warmup exceeded ${VOICE_ENGINE_V2_ADM_WARMUP_DEADLINE_MS}ms deadline`,
	};
}
