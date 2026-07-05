// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';
import {VoiceEngineV2Simulator} from '../../../packages/voice_engine_v2/src/simulation/Simulator';
import {defineNetworkPartitionDuringScreenShareScenario} from '../../../packages/voice_engine_v2/src/simulation/scenarios/networkPartitionDuringScreenShare';

const REPORT_SCHEMA = 1;
const SCENARIO_NAME = 'event_log_replay_determinism';
const SEED = 4242;

interface Report {
	schema: number;
	scenario: string;
	platform: string;
	status: 'pass' | 'fail';
	measurements: Record<string, unknown>;
	assertions: Array<string>;
}

function platform(): string {
	if (process.platform === 'darwin') return 'macos';
	if (process.platform === 'linux') return 'linux';
	if (process.platform === 'win32') return 'windows';
	return 'unknown';
}

async function runOnce(): Promise<{snapshotHash: string; eventCount: number; finalTick: number}> {
	const scenario = defineNetworkPartitionDuringScreenShareScenario(SEED);
	assert.ok(scenario.workload, 'scenario must yield a workload');
	const simulator = new VoiceEngineV2Simulator({
		seed: SEED,
		workload: scenario.workload,
		faults: scenario.faultPlan,
		mode: scenario.mode,
	});
	const result = await simulator.run();
	assert.ok(typeof result.snapshotHash === 'string', 'snapshot hash must be a string');
	assert.equal(result.snapshotHash.length, 8, 'snapshot hash is eight hex characters');
	return {
		snapshotHash: result.snapshotHash,
		eventCount: result.eventLog.length,
		finalTick: result.finalTick,
	};
}

async function main(): Promise<void> {
	const expectedHashArg = process.argv[2] ?? null;
	const first = await runOnce();
	const second = await runOnce();
	const assertions: Array<string> = [];
	if (first.snapshotHash !== second.snapshotHash) {
		emit({
			schema: REPORT_SCHEMA,
			scenario: SCENARIO_NAME,
			platform: platform(),
			status: 'fail',
			measurements: {first, second},
			assertions: ['two runs of the same scenario must agree on snapshot hash'],
		});
		process.exit(1);
	}
	assertions.push('two runs of the same scenario agree on snapshot hash');
	if (first.eventCount !== second.eventCount) {
		emit({
			schema: REPORT_SCHEMA,
			scenario: SCENARIO_NAME,
			platform: platform(),
			status: 'fail',
			measurements: {first, second},
			assertions: ['event log length must agree across runs'],
		});
		process.exit(1);
	}
	assertions.push('event log length agrees across runs');
	if (expectedHashArg !== null && expectedHashArg !== first.snapshotHash) {
		emit({
			schema: REPORT_SCHEMA,
			scenario: SCENARIO_NAME,
			platform: platform(),
			status: 'fail',
			measurements: {expected: expectedHashArg, observed: first.snapshotHash, runs: [first, second]},
			assertions: [`snapshot hash mismatch: expected ${expectedHashArg}, observed ${first.snapshotHash}`],
		});
		process.exit(1);
	}
	if (expectedHashArg !== null) {
		assertions.push('snapshot hash matches expected fixture');
	}
	emit({
		schema: REPORT_SCHEMA,
		scenario: SCENARIO_NAME,
		platform: platform(),
		status: 'pass',
		measurements: {
			snapshot_hash: first.snapshotHash,
			event_count: first.eventCount,
			final_tick: first.finalTick,
			seed: SEED,
		},
		assertions,
	});
}

function emit(report: Report): void {
	process.stdout.write(`${JSON.stringify(report)}\n`);
}

main().catch((error) => {
	emit({
		schema: REPORT_SCHEMA,
		scenario: SCENARIO_NAME,
		platform: platform(),
		status: 'fail',
		measurements: {error: String(error)},
		assertions: ['driver threw before finishing scenario'],
	});
	process.exit(1);
});
