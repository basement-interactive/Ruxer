// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	formatGatewayReadyTimings,
	type GatewayTimings,
	type RpcTimings,
} from '@app/features/gateway/transport/GatewayTimingsFormatter';
import {
	GATEWAY_TIMINGS_FIXTURE,
	RPC_TIMINGS_FIXTURE,
} from '@app/features/gateway/transport/GatewayTimingsFormatter.fixtures';
import {describe, expect, it} from 'vitest';

describe('formatGatewayReadyTimings', () => {
	it('returns null when neither payload is present', () => {
		expect(formatGatewayReadyTimings(undefined, undefined)).toBeNull();
	});

	it('renders the gateway pod as the root line in milliseconds', () => {
		const tree = formatGatewayReadyTimings(GATEWAY_TIMINGS_FIXTURE, RPC_TIMINGS_FIXTURE);
		expect(tree).not.toBeNull();
		const lines = (tree as string).split('\n');
		expect(lines[1]).toBe('gateway-77d76684d9-hvvrm: 567.48');
	});

	it('converts microseconds to milliseconds and trims trailing zeros', () => {
		const gw: GatewayTimings = {
			pod_name: 'gw-1',
			total_us: 441305,
			unit: 'microseconds',
			trace: [
				{name: 'id_created', duration_us: 437},
				{name: 'session_lookup_finished', duration_us: 11},
				{name: 'sessions', duration_us: 433340},
			],
		};
		const tree = formatGatewayReadyTimings(gw, undefined);
		expect(tree).toBe(
			[
				'slowest: sessions (433.34), id_created (0.437), session_lookup_finished (0.011)',
				'gw-1: 441.305',
				'|  id_created: 0.437',
				'|  session_lookup_finished: 0.011',
				'|  sessions: 433.34',
			].join('\n'),
		);
	});

	it('indents nested gateway children with "|  " per depth', () => {
		const tree = formatGatewayReadyTimings(GATEWAY_TIMINGS_FIXTURE, RPC_TIMINGS_FIXTURE) as string;
		const lines = tree.split('\n');
		const idx = lines.findIndex((l) => l.includes('acquire_and_fetch/2'));
		expect(lines[idx]).toBe('|  session_manager_shard_lifecycle:acquire_and_fetch/2: 84.009');
		expect(lines[idx + 1]).toBe('|  |  gateway_concurrency:try_acquire_session_start/0: 0.006');
		expect(lines[idx + 2]).toBe('|  |  session_manager_shard_drain:fetch_rpc_data/2 -> api-b6478896-6mkw5: 83.795');
	});

	it('grafts the RPC breakdown beneath the api remote hop', () => {
		const tree = formatGatewayReadyTimings(GATEWAY_TIMINGS_FIXTURE, RPC_TIMINGS_FIXTURE) as string;
		const lines = tree.split('\n');
		const hopIdx = lines.findIndex((l) => l.includes('fetch_rpc_data/2 -> api-b6478896-6mkw5'));
		expect(lines[hopIdx + 1]).toBe('|  |  |  api-b6478896-6mkw5 (api): 73.513');
		expect(lines[hopIdx + 2]).toBe('|  |  |  |  build_rate_limit_bucket_key: 0');
	});

	it('renders deeply nested RPC steps (load_user_data -> children)', () => {
		const tree = formatGatewayReadyTimings(GATEWAY_TIMINGS_FIXTURE, RPC_TIMINGS_FIXTURE) as string;
		const lines = tree.split('\n');
		const parentIdx = lines.findIndex((l) => l.includes('load_user_data'));
		expect(lines[parentIdx]).toBe('|  |  |  |  load_user_data: 43.545');
		expect(lines[parentIdx + 1]).toBe('|  |  |  |  |  find_all_guild_settings: 7.296');
		expect(lines.some((l) => l === '|  |  |  |  |  list_private_channels: 40.274')).toBe(true);
	});

	it('renders three levels of RPC nesting (map_ready_payloads -> preload -> request)', () => {
		const tree = formatGatewayReadyTimings(GATEWAY_TIMINGS_FIXTURE, RPC_TIMINGS_FIXTURE) as string;
		expect(tree).toContain('|  |  |  |  map_ready_payloads: 17.544');
		expect(tree).toContain('|  |  |  |  |  preload_user_partials: 16.941');
		expect(tree).toContain('|  |  |  |  |  |  users_service_request: 16.783');
	});

	it('grafts the RPC tree only once even though the trace has many remote hops', () => {
		const tree = formatGatewayReadyTimings(GATEWAY_TIMINGS_FIXTURE, RPC_TIMINGS_FIXTURE) as string;
		const occurrences = tree.split('\n').filter((l) => l.includes('(api): 73.513')).length;
		expect(occurrences).toBe(1);
	});

	it('still surfaces RPC timings when the gateway trace never references the rpc pod', () => {
		const orphanRpc: RpcTimings = {
			pod_name: 'api-orphan',
			role: 'api',
			total_us: 1000,
			steps: {only_step: {duration_us: 1000}},
		};
		const gw: GatewayTimings = {pod_name: 'gw-1', total_us: 2000, trace: [{name: 'noop', duration_us: 2000}]};
		const tree = formatGatewayReadyTimings(gw, orphanRpc) as string;
		const lines = tree.split('\n');
		expect(lines).toEqual([
			'slowest: noop (2), only_step (1)',
			'gw-1: 2',
			'|  noop: 2',
			'|  api-orphan (api): 1',
			'|  |  only_step: 1',
		]);
	});

	it('renders an RPC-only payload rooted at depth 0', () => {
		const tree = formatGatewayReadyTimings(undefined, RPC_TIMINGS_FIXTURE) as string;
		const lines = tree.split('\n');
		expect(lines[0]).toBe(
			'slowest: list_private_channels (40.274), get_read_states (21.124), users_service_request (16.783)',
		);
		expect(lines[1]).toBe('api-b6478896-6mkw5 (api): 73.513');
		expect(lines[2]).toBe('|  build_rate_limit_bucket_key: 0');
	});

	it('prepends a one-line summary of the slowest leaf spans', () => {
		const tree = formatGatewayReadyTimings(GATEWAY_TIMINGS_FIXTURE, RPC_TIMINGS_FIXTURE) as string;
		const lines = tree.split('\n');
		expect(lines[0]).toBe(
			'slowest: session_ready_collect:collect_ready_presences/2 (76.883), list_private_channels (40.274), get_read_states (21.124)',
		);
		expect(lines[1]).toBe('gateway-77d76684d9-hvvrm: 567.48');
	});

	it('matches the full combined snapshot for the captured production payloads', () => {
		const tree = formatGatewayReadyTimings(GATEWAY_TIMINGS_FIXTURE, RPC_TIMINGS_FIXTURE);
		expect(tree).toMatchSnapshot();
	});
});
