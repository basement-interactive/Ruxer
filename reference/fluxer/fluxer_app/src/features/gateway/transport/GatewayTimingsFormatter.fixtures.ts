// SPDX-License-Identifier: AGPL-3.0-or-later

import type {GatewayTimings, RpcTimings} from '@app/features/gateway/transport/GatewayTimingsFormatter';

export const RPC_TIMINGS_FIXTURE: RpcTimings = {
	node_name: 'api-b6478896-6mkw5',
	pod_name: 'api-b6478896-6mkw5',
	role: 'api',
	steps: {
		build_rate_limit_bucket_key: {duration_us: 0},
		build_rtc_regions: {duration_us: 46},
		build_session_response_payload: {
			duration_us: 6193,
			steps: {
				encode_read_state_proto: {duration_us: 5119},
				map_auth_session_id_hash: {duration_us: 37},
				map_favorite_memes: {duration_us: 38},
				map_notes: {duration_us: 7},
				map_pinned_dms: {duration_us: 2},
				map_read_states: {duration_us: 275},
				map_user: {duration_us: 222},
				map_user_guild_settings: {duration_us: 314},
				map_user_settings: {duration_us: 150},
				map_webauthn_credentials: {duration_us: 1},
			},
		},
		check_session_rate_limit: {duration_us: 794},
		compute_token_hash_prefix: {duration_us: 1},
		ensure_personal_notes_channel: {duration_us: 2036},
		ensure_private_channels_within_limit: {duration_us: 64, steps: {resolve_private_channel_limit: {duration_us: 57}}},
		hash_session_token: {duration_us: 39},
		load_user_data: {
			duration_us: 43545,
			steps: {
				find_all_guild_settings: {duration_us: 7296},
				find_settings: {duration_us: 6735},
				find_user: {duration_us: 3136},
				get_pinned_dms: {duration_us: 4093},
				get_read_states: {duration_us: 21124},
				get_user_guild_ids: {duration_us: 5144},
				get_user_notes: {duration_us: 3716},
				list_favorite_memes: {duration_us: 3676},
				list_private_channels: {duration_us: 40274},
				list_relationships: {duration_us: 6678},
				list_webauthn_credentials: {duration_us: 3709},
			},
		},
		log_session_handling_completed: {duration_us: 10},
		log_session_handling_started: {duration_us: 5},
		lookup_geoip: {duration_us: 139},
		map_geoip_result: {duration_us: 10},
		map_ready_payloads: {
			duration_us: 17544,
			steps: {
				map_guild_ids: {duration_us: 10},
				map_private_channels: {duration_us: 592},
				map_relationships: {duration_us: 394},
				preload_user_partials: {
					duration_us: 16941,
					steps: {collect_user_partial_ids: {duration_us: 43}, users_service_request: {duration_us: 16783}},
				},
			},
		},
		normalize_session_token: {duration_us: 3},
		parse_token_type: {duration_us: 1},
		process_session_start: {
			duration_us: 123,
			steps: {
				apply_high_risk_country_inbound_phone_requirement: {
					duration_us: 25,
					steps: {check_bot_user: {duration_us: 0}, check_verified_phone: {duration_us: 0}},
				},
				build_session_flag_patch: {duration_us: 0},
				clear_expired_custom_status: {duration_us: 0},
				compute_session_and_premium_flags: {duration_us: 9},
				queue_country_sighting_record: {duration_us: 43},
			},
		},
		queue_payment_reconciliation: {duration_us: 0},
		queue_stripe_premium_state_reconciliation: {duration_us: 1},
		sync_repaired_user_data: {duration_us: 0},
		validate_user_session_token: {duration_us: 2860},
	},
	total_us: 73513,
	unit: 'microseconds',
};

export const GATEWAY_TIMINGS_FIXTURE: GatewayTimings = {
	pod_name: 'gateway-77d76684d9-hvvrm',
	total_us: 567480,
	trace: [
		{
			duration_us: 139,
			name: 'gateway_handler_identify:validate_identify_data/1',
		},
		{
			children: [
				{
					duration_us: 6,
					name: 'gateway_concurrency:try_acquire_session_start/0',
				},
				{
					duration_us: 83795,
					name: 'session_manager_shard_drain:fetch_rpc_data/2',
					remote: {
						operation: 'api',
						pod_name: 'api-b6478896-6mkw5',
					},
				},
			],
			duration_us: 84009,
			name: 'session_manager_shard_lifecycle:acquire_and_fetch/2',
		},
		{
			duration_us: 115,
			name: 'session_manager_shard_start:validate_identify_payload/1',
		},
		{
			duration_us: 80,
			name: 'gateway_rollout_config:is_session_eligible/1',
		},
		{
			duration_us: 76,
			name: 'session_abuse_protection:check_user_session_limit/1',
		},
		{
			duration_us: 4055,
			name: 'session_manager_shard_drain:build_session_data/7',
		},
		{
			duration_us: 633,
			name: 'session_init:build_state/1',
		},
		{
			duration_us: 14010,
			name: 'session_init:schedule_timers/1',
		},
		{
			duration_us: 1767,
			name: 'presence_manager:start_or_lookup/1',
			remote: {
				operation: 'presence_manager',
				pod_name: 'gateway-presence-1',
			},
		},
		{
			duration_us: 1462,
			name: 'presence_session:handle_session_connect/3',
			remote: {
				operation: 'presence',
				pod_name: 'gateway-presence-1',
			},
		},
		{
			duration_us: 706,
			name: 'session_connection_guild_resolve:do_remote_guild_connect_attempt/4',
			remote: {
				operation: 'guild_manager',
				pod_name: 'gateway-guilds-10',
			},
		},
		{
			duration_us: 670,
			name: 'session_connection_guild_resolve:do_remote_guild_connect_attempt/4',
			remote: {
				operation: 'guild_manager',
				pod_name: 'gateway-guilds-6',
			},
		},
		{
			duration_us: 748,
			name: 'session_connection_guild_resolve:do_remote_guild_connect_attempt/4',
			remote: {
				operation: 'guild_manager',
				pod_name: 'gateway-guilds-6',
			},
		},
		{
			duration_us: 813,
			name: 'session_connection_guild_resolve:do_remote_guild_connect_attempt/4',
			remote: {
				operation: 'guild_manager',
				pod_name: 'gateway-guilds-6',
			},
		},
		{
			duration_us: 235,
			name: 'session_connection_guild_resolve:send_connect_cast/5',
			remote: {
				operation: 'guild',
				pod_name: 'gateway-guilds-10',
			},
		},
		{
			duration_us: 236,
			name: 'session_connection_guild_resolve:send_connect_cast/5',
			remote: {
				operation: 'guild',
				pod_name: 'gateway-guilds-6',
			},
		},
		{
			duration_us: 218,
			name: 'session_connection_guild_resolve:send_connect_cast/5',
			remote: {
				operation: 'guild',
				pod_name: 'gateway-guilds-6',
			},
		},
		{
			duration_us: 957,
			name: 'session_connection_guild_resolve:do_remote_guild_connect_attempt/4',
			remote: {
				operation: 'guild_manager',
				pod_name: 'gateway-guilds-11',
			},
		},
		{
			duration_us: 204,
			name: 'session_connection_guild_resolve:send_connect_cast/5',
			remote: {
				operation: 'guild',
				pod_name: 'gateway-guilds-6',
			},
		},
		{
			duration_us: 1191,
			name: 'session_connection_guild:do_guild_connect/1',
		},
		{
			duration_us: 1149,
			name: 'session_connection_guild:do_guild_connect/1',
		},
		{
			duration_us: 1255,
			name: 'session_connection_guild:do_guild_connect/1',
		},
		{
			duration_us: 136,
			name: 'session_connection_guild_resolve:send_connect_cast/5',
			remote: {
				operation: 'guild',
				pod_name: 'gateway-guilds-11',
			},
		},
		{
			duration_us: 1348,
			name: 'session_connection_guild_resolve:do_remote_guild_connect_attempt/4',
			remote: {
				operation: 'guild_manager',
				pod_name: 'gateway-guilds-7',
			},
		},
		{
			duration_us: 1280,
			name: 'session_connection_guild_resolve:do_remote_guild_connect_attempt/4',
			remote: {
				operation: 'guild_manager',
				pod_name: 'gateway-guilds-7',
			},
		},
		{
			duration_us: 1371,
			name: 'session_connection_guild:do_guild_connect/1',
		},
		{
			duration_us: 1317,
			name: 'session_connection_guild:do_guild_connect/1',
		},
		{
			duration_us: 154,
			name: 'session_connection_guild_resolve:send_connect_cast/5',
			remote: {
				operation: 'guild',
				pod_name: 'gateway-guilds-7',
			},
		},
		{
			duration_us: 1747,
			name: 'session_connection_guild:do_guild_connect/1',
		},
		{
			duration_us: 1738,
			name: 'session_connection_guild_resolve:do_remote_guild_connect_attempt/4',
			remote: {
				operation: 'guild_manager',
				pod_name: 'gateway-guilds-2',
			},
		},
		{
			duration_us: 2024,
			name: 'session_connection_guild_resolve:do_remote_guild_connect_attempt/4',
			remote: {
				operation: 'guild_manager',
				pod_name: 'gateway-guilds-8',
			},
		},
		{
			duration_us: 1916,
			name: 'session_connection_guild_resolve:do_remote_guild_connect_attempt/4',
			remote: {
				operation: 'guild_manager',
				pod_name: 'gateway-guilds-2',
			},
		},
		{
			duration_us: 2044,
			name: 'session_connection_guild_resolve:do_remote_guild_connect_attempt/4',
			remote: {
				operation: 'guild_manager',
				pod_name: 'gateway-guilds-2',
			},
		},
		{
			duration_us: 2103,
			name: 'session_connection_guild_resolve:do_remote_guild_connect_attempt/4',
			remote: {
				operation: 'guild_manager',
				pod_name: 'gateway-guilds-1',
			},
		},
		{
			duration_us: 2048,
			name: 'session_connection_guild_resolve:do_remote_guild_connect_attempt/4',
			remote: {
				operation: 'guild_manager',
				pod_name: 'gateway-guilds-1',
			},
		},
		{
			duration_us: 2128,
			name: 'session_connection_guild_resolve:do_remote_guild_connect_attempt/4',
			remote: {
				operation: 'guild_manager',
				pod_name: 'gateway-guilds-0',
			},
		},
		{
			duration_us: 2142,
			name: 'session_connection_guild_resolve:do_remote_guild_connect_attempt/4',
			remote: {
				operation: 'guild_manager',
				pod_name: 'gateway-guilds-0',
			},
		},
		{
			duration_us: 303,
			name: 'session_connection_guild_resolve:send_connect_cast/5',
			remote: {
				operation: 'guild',
				pod_name: 'gateway-guilds-8',
			},
		},
		{
			duration_us: 2153,
			name: 'session_connection_guild_resolve:do_remote_guild_connect_attempt/4',
			remote: {
				operation: 'guild_manager',
				pod_name: 'gateway-guilds-3',
			},
		},
		{
			duration_us: 2164,
			name: 'session_connection_guild_resolve:do_remote_guild_connect_attempt/4',
			remote: {
				operation: 'guild_manager',
				pod_name: 'gateway-guilds-3',
			},
		},
		{
			duration_us: 923,
			name: 'session_connection_guild_resolve:send_connect_cast/5',
			remote: {
				operation: 'guild',
				pod_name: 'gateway-guilds-7',
			},
		},
		{
			duration_us: 321,
			name: 'session_connection_guild_resolve:send_connect_cast/5',
			remote: {
				operation: 'guild',
				pod_name: 'gateway-guilds-2',
			},
		},
		{
			duration_us: 2405,
			name: 'session_connection_guild_resolve:do_remote_guild_connect_attempt/4',
			remote: {
				operation: 'guild_manager',
				pod_name: 'gateway-guilds-4',
			},
		},
		{
			duration_us: 368,
			name: 'session_connection_guild_resolve:send_connect_cast/5',
			remote: {
				operation: 'guild',
				pod_name: 'gateway-guilds-2',
			},
		},
		{
			duration_us: 2467,
			name: 'session_connection_guild_resolve:do_remote_guild_connect_attempt/4',
			remote: {
				operation: 'guild_manager',
				pod_name: 'gateway-guilds-3',
			},
		},
		{
			duration_us: 211,
			name: 'session_connection_guild_resolve:send_connect_cast/5',
			remote: {
				operation: 'guild',
				pod_name: 'gateway-guilds-0',
			},
		},
		{
			duration_us: 493,
			name: 'session_connection_guild_resolve:send_connect_cast/5',
			remote: {
				operation: 'guild',
				pod_name: 'gateway-guilds-2',
			},
		},
		{
			duration_us: 2608,
			name: 'session_connection_guild:do_guild_connect/1',
		},
		{
			duration_us: 2735,
			name: 'session_connection_guild:do_guild_connect/1',
		},
		{
			duration_us: 2839,
			name: 'session_connection_guild:do_guild_connect/1',
		},
		{
			duration_us: 2709,
			name: 'session_connection_guild:do_guild_connect/1',
		},
		{
			duration_us: 546,
			name: 'session_connection_guild_resolve:send_connect_cast/5',
			remote: {
				operation: 'guild',
				pod_name: 'gateway-guilds-1',
			},
		},
		{
			duration_us: 196,
			name: 'session_connection_guild_resolve:send_connect_cast/5',
			remote: {
				operation: 'guild',
				pod_name: 'gateway-guilds-4',
			},
		},
		{
			duration_us: 412,
			name: 'session_connection_guild_resolve:send_connect_cast/5',
			remote: {
				operation: 'guild',
				pod_name: 'gateway-guilds-0',
			},
		},
		{
			duration_us: 552,
			name: 'session_connection_guild_resolve:send_connect_cast/5',
			remote: {
				operation: 'guild',
				pod_name: 'gateway-guilds-1',
			},
		},
		{
			duration_us: 2872,
			name: 'session_connection_guild:do_guild_connect/1',
		},
		{
			duration_us: 2844,
			name: 'session_connection_guild:do_guild_connect/1',
		},
		{
			duration_us: 2973,
			name: 'session_connection_guild_resolve:do_remote_guild_connect_attempt/4',
			remote: {
				operation: 'guild_manager',
				pod_name: 'gateway-guilds-0',
			},
		},
		{
			duration_us: 2883,
			name: 'session_connection_guild:do_guild_connect/1',
		},
		{
			duration_us: 343,
			name: 'session_connection_guild_resolve:send_connect_cast/5',
			remote: {
				operation: 'guild',
				pod_name: 'gateway-guilds-3',
			},
		},
		{
			duration_us: 275,
			name: 'session_connection_guild_resolve:send_connect_cast/5',
			remote: {
				operation: 'guild',
				pod_name: 'gateway-guilds-3',
			},
		},
		{
			duration_us: 174,
			name: 'session_connection_guild_resolve:send_connect_cast/5',
			remote: {
				operation: 'guild',
				pod_name: 'gateway-guilds-3',
			},
		},
		{
			duration_us: 2952,
			name: 'session_connection_guild:do_guild_connect/1',
		},
		{
			duration_us: 2972,
			name: 'session_connection_guild:do_guild_connect/1',
		},
		{
			duration_us: 3107,
			name: 'session_connection_guild_resolve:do_remote_guild_connect_attempt/4',
			remote: {
				operation: 'guild_manager',
				pod_name: 'gateway-guilds-1',
			},
		},
		{
			duration_us: 3120,
			name: 'session_connection_guild_resolve:do_remote_guild_connect_attempt/4',
			remote: {
				operation: 'guild_manager',
				pod_name: 'gateway-guilds-4',
			},
		},
		{
			duration_us: 3072,
			name: 'session_connection_guild:do_guild_connect/1',
		},
		{
			duration_us: 3095,
			name: 'session_connection_guild:do_guild_connect/1',
		},
		{
			duration_us: 3068,
			name: 'session_connection_guild_resolve:do_remote_guild_connect_attempt/4',
			remote: {
				operation: 'guild_manager',
				pod_name: 'gateway-guilds-8',
			},
		},
		{
			duration_us: 3103,
			name: 'session_connection_guild_resolve:do_remote_guild_connect_attempt/4',
			remote: {
				operation: 'guild_manager',
				pod_name: 'gateway-guilds-1',
			},
		},
		{
			duration_us: 3161,
			name: 'session_connection_guild_resolve:do_remote_guild_connect_attempt/4',
			remote: {
				operation: 'guild_manager',
				pod_name: 'gateway-guilds-3',
			},
		},
		{
			duration_us: 3102,
			name: 'session_connection_guild_resolve:do_remote_guild_connect_attempt/4',
			remote: {
				operation: 'guild_manager',
				pod_name: 'gateway-guilds-1',
			},
		},
		{
			duration_us: 3095,
			name: 'session_connection_guild_resolve:do_remote_guild_connect_attempt/4',
			remote: {
				operation: 'guild_manager',
				pod_name: 'gateway-guilds-3',
			},
		},
		{
			duration_us: 3186,
			name: 'session_connection_guild:do_guild_connect/1',
		},
		{
			duration_us: 3131,
			name: 'session_connection_guild:do_guild_connect/1',
		},
		{
			duration_us: 3086,
			name: 'session_connection_guild_resolve:do_remote_guild_connect_attempt/4',
			remote: {
				operation: 'guild_manager',
				pod_name: 'gateway-guilds-3',
			},
		},
		{
			duration_us: 132,
			name: 'session_connection_guild_resolve:send_connect_cast/5',
			remote: {
				operation: 'guild',
				pod_name: 'gateway-guilds-0',
			},
		},
		{
			duration_us: 172,
			name: 'session_connection_guild_resolve:send_connect_cast/5',
			remote: {
				operation: 'guild',
				pod_name: 'gateway-guilds-4',
			},
		},
		{
			duration_us: 3451,
			name: 'session_connection_guild:do_guild_connect/1',
		},
		{
			duration_us: 277,
			name: 'session_connection_guild_resolve:send_connect_cast/5',
			remote: {
				operation: 'guild',
				pod_name: 'gateway-guilds-1',
			},
		},
		{
			duration_us: 207,
			name: 'session_connection_guild_resolve:send_connect_cast/5',
			remote: {
				operation: 'guild',
				pod_name: 'gateway-guilds-1',
			},
		},
		{
			duration_us: 3501,
			name: 'session_connection_guild:do_guild_connect/1',
		},
		{
			duration_us: 436,
			name: 'session_connection_guild_resolve:send_connect_cast/5',
			remote: {
				operation: 'guild',
				pod_name: 'gateway-guilds-1',
			},
		},
		{
			duration_us: 3579,
			name: 'session_connection_guild:do_guild_connect/1',
		},
		{
			duration_us: 448,
			name: 'session_connection_guild_resolve:send_connect_cast/5',
			remote: {
				operation: 'guild',
				pod_name: 'gateway-guilds-8',
			},
		},
		{
			duration_us: 345,
			name: 'session_connection_guild_resolve:send_connect_cast/5',
			remote: {
				operation: 'guild',
				pod_name: 'gateway-guilds-3',
			},
		},
		{
			duration_us: 246,
			name: 'session_connection_guild_resolve:send_connect_cast/5',
			remote: {
				operation: 'guild',
				pod_name: 'gateway-guilds-3',
			},
		},
		{
			duration_us: 3623,
			name: 'session_connection_guild:do_guild_connect/1',
		},
		{
			duration_us: 366,
			name: 'session_connection_guild_resolve:send_connect_cast/5',
			remote: {
				operation: 'guild',
				pod_name: 'gateway-guilds-3',
			},
		},
		{
			duration_us: 3685,
			name: 'session_connection_guild:do_guild_connect/1',
		},
		{
			duration_us: 3709,
			name: 'session_connection_guild:do_guild_connect/1',
		},
		{
			duration_us: 3791,
			name: 'session_connection_guild:do_guild_connect/1',
		},
		{
			duration_us: 3716,
			name: 'session_connection_guild:do_guild_connect/1',
		},
		{
			duration_us: 3778,
			name: 'session_connection_guild:do_guild_connect/1',
		},
		{
			duration_us: 4822,
			name: 'session_connection_guild_resolve:do_remote_guild_connect_attempt/4',
			remote: {
				operation: 'guild_manager',
				pod_name: 'gateway-guilds-5',
			},
		},
		{
			duration_us: 4845,
			name: 'session_connection_guild_resolve:do_remote_guild_connect_attempt/4',
			remote: {
				operation: 'guild_manager',
				pod_name: 'gateway-guilds-5',
			},
		},
		{
			duration_us: 4871,
			name: 'session_connection_guild_resolve:do_remote_guild_connect_attempt/4',
			remote: {
				operation: 'guild_manager',
				pod_name: 'gateway-guilds-5',
			},
		},
		{
			duration_us: 174,
			name: 'session_connection_guild_resolve:send_connect_cast/5',
			remote: {
				operation: 'guild',
				pod_name: 'gateway-guilds-5',
			},
		},
		{
			duration_us: 232,
			name: 'session_connection_guild_resolve:send_connect_cast/5',
			remote: {
				operation: 'guild',
				pod_name: 'gateway-guilds-5',
			},
		},
		{
			duration_us: 5193,
			name: 'session_connection_guild:do_guild_connect/1',
		},
		{
			duration_us: 5254,
			name: 'session_connection_guild:do_guild_connect/1',
		},
		{
			duration_us: 275,
			name: 'session_connection_guild_resolve:send_connect_cast/5',
			remote: {
				operation: 'guild',
				pod_name: 'gateway-guilds-5',
			},
		},
		{
			duration_us: 5280,
			name: 'session_connection_guild_resolve:do_remote_guild_connect_attempt/4',
			remote: {
				operation: 'guild_manager',
				pod_name: 'gateway-guilds-5',
			},
		},
		{
			duration_us: 5346,
			name: 'session_connection_guild:do_guild_connect/1',
		},
		{
			duration_us: 126,
			name: 'session_connection_guild_resolve:send_connect_cast/5',
			remote: {
				operation: 'guild',
				pod_name: 'gateway-guilds-5',
			},
		},
		{
			duration_us: 5611,
			name: 'session_connection_guild:do_guild_connect/1',
		},
		{
			duration_us: 697,
			name: 'session_connection_guild_resolve:do_remote_guild_connect_attempt/4',
			remote: {
				operation: 'guild_manager',
				pod_name: 'gateway-guilds-6',
			},
		},
		{
			duration_us: 805,
			name: 'session_connection_guild_resolve:do_remote_guild_connect_attempt/4',
			remote: {
				operation: 'guild_manager',
				pod_name: 'gateway-guilds-6',
			},
		},
		{
			duration_us: 740,
			name: 'session_connection_guild_resolve:do_remote_guild_connect_attempt/4',
			remote: {
				operation: 'guild_manager',
				pod_name: 'gateway-guilds-11',
			},
		},
		{
			duration_us: 154,
			name: 'session_connection_guild_resolve:send_connect_cast/5',
			remote: {
				operation: 'guild',
				pod_name: 'gateway-guilds-6',
			},
		},
		{
			duration_us: 218,
			name: 'session_connection_guild_resolve:send_connect_cast/5',
			remote: {
				operation: 'guild',
				pod_name: 'gateway-guilds-6',
			},
		},
		{
			duration_us: 1105,
			name: 'session_connection_guild:do_guild_connect/1',
		},
		{
			duration_us: 998,
			name: 'session_connection_guild_resolve:do_remote_guild_connect_attempt/4',
			remote: {
				operation: 'guild_manager',
				pod_name: 'gateway-guilds-11',
			},
		},
		{
			duration_us: 1086,
			name: 'session_connection_guild_resolve:do_remote_guild_connect_attempt/4',
			remote: {
				operation: 'guild_manager',
				pod_name: 'gateway-guilds-10',
			},
		},
		{
			duration_us: 355,
			name: 'session_connection_guild_resolve:send_connect_cast/5',
			remote: {
				operation: 'guild',
				pod_name: 'gateway-guilds-11',
			},
		},
		{
			duration_us: 1482,
			name: 'session_connection_guild:do_guild_connect/1',
		},
		{
			duration_us: 1329,
			name: 'session_connection_guild_resolve:do_remote_guild_connect_attempt/4',
			remote: {
				operation: 'guild_manager',
				pod_name: 'gateway-guilds-10',
			},
		},
		{
			duration_us: 1403,
			name: 'session_connection_guild:do_guild_connect/1',
		},
		{
			duration_us: 372,
			name: 'session_connection_guild_resolve:send_connect_cast/5',
			remote: {
				operation: 'guild',
				pod_name: 'gateway-guilds-10',
			},
		},
		{
			duration_us: 384,
			name: 'session_connection_guild_resolve:send_connect_cast/5',
			remote: {
				operation: 'guild',
				pod_name: 'gateway-guilds-11',
			},
		},
		{
			duration_us: 1566,
			name: 'session_connection_guild_resolve:do_remote_guild_connect_attempt/4',
			remote: {
				operation: 'guild_manager',
				pod_name: 'gateway-guilds-7',
			},
		},
		{
			duration_us: 1745,
			name: 'session_connection_guild_resolve:do_remote_guild_connect_attempt/4',
			remote: {
				operation: 'guild_manager',
				pod_name: 'gateway-guilds-0',
			},
		},
		{
			duration_us: 1598,
			name: 'session_connection_guild_resolve:do_remote_guild_connect_attempt/4',
			remote: {
				operation: 'guild_manager',
				pod_name: 'gateway-guilds-11',
			},
		},
		{
			duration_us: 1891,
			name: 'session_connection_guild:do_guild_connect/1',
		},
		{
			duration_us: 2038,
			name: 'session_connection_guild_resolve:do_remote_guild_connect_attempt/4',
			remote: {
				operation: 'guild_manager',
				pod_name: 'gateway-guilds-2',
			},
		},
		{
			duration_us: 1932,
			name: 'session_connection_guild_resolve:do_remote_guild_connect_attempt/4',
			remote: {
				operation: 'guild_manager',
				pod_name: 'gateway-guilds-1',
			},
		},
		{
			duration_us: 1930,
			name: 'session_connection_guild:do_guild_connect/1',
		},
		{
			duration_us: 357,
			name: 'session_connection_guild_resolve:send_connect_cast/5',
			remote: {
				operation: 'guild',
				pod_name: 'gateway-guilds-7',
			},
		},
		{
			duration_us: 2146,
			name: 'session_connection_guild_resolve:do_remote_guild_connect_attempt/4',
			remote: {
				operation: 'guild_manager',
				pod_name: 'gateway-guilds-2',
			},
		},
		{
			duration_us: 667,
			name: 'session_connection_guild_resolve:send_connect_cast/5',
			remote: {
				operation: 'guild',
				pod_name: 'gateway-guilds-10',
			},
		},
		{
			duration_us: 2294,
			name: 'session_connection_guild_resolve:do_remote_guild_connect_attempt/4',
			remote: {
				operation: 'guild_manager',
				pod_name: 'gateway-guilds-1',
			},
		},
		{
			duration_us: 2281,
			name: 'session_connection_guild_resolve:do_remote_guild_connect_attempt/4',
			remote: {
				operation: 'guild_manager',
				pod_name: 'gateway-guilds-3',
			},
		},
		{
			duration_us: 314,
			name: 'session_connection_guild_resolve:send_connect_cast/5',
			remote: {
				operation: 'guild',
				pod_name: 'gateway-guilds-2',
			},
		},
		{
			duration_us: 2275,
			name: 'session_connection_guild:do_guild_connect/1',
		},
		{
			duration_us: 2288,
			name: 'session_connection_guild_resolve:do_remote_guild_connect_attempt/4',
			remote: {
				operation: 'guild_manager',
				pod_name: 'gateway-guilds-9',
			},
		},
		{
			duration_us: 267,
			name: 'session_connection_guild_resolve:send_connect_cast/5',
			remote: {
				operation: 'guild',
				pod_name: 'gateway-guilds-1',
			},
		},
		{
			duration_us: 2504,
			name: 'session_connection_guild:do_guild_connect/1',
		},
		{
			duration_us: 2698,
			name: 'session_connection_guild:do_guild_connect/1',
		},
		{
			duration_us: 139,
			name: 'session_connection_guild_resolve:send_connect_cast/5',
			remote: {
				operation: 'guild',
				pod_name: 'gateway-guilds-3',
			},
		},
		{
			duration_us: 2703,
			name: 'session_connection_guild_resolve:do_remote_guild_connect_attempt/4',
			remote: {
				operation: 'guild_manager',
				pod_name: 'gateway-guilds-1',
			},
		},
		{
			duration_us: 800,
			name: 'session_connection_guild_resolve:send_connect_cast/5',
			remote: {
				operation: 'guild',
				pod_name: 'gateway-guilds-0',
			},
		},
		{
			duration_us: 2707,
			name: 'session_connection_guild_resolve:do_remote_guild_connect_attempt/4',
			remote: {
				operation: 'guild_manager',
				pod_name: 'gateway-guilds-3',
			},
		},
		{
			duration_us: 2672,
			name: 'session_connection_guild_resolve:do_remote_guild_connect_attempt/4',
			remote: {
				operation: 'guild_manager',
				pod_name: 'gateway-guilds-3',
			},
		},
		{
			duration_us: 2863,
			name: 'session_connection_guild_resolve:do_remote_guild_connect_attempt/4',
			remote: {
				operation: 'guild_manager',
				pod_name: 'gateway-guilds-8',
			},
		},
		{
			duration_us: 2721,
			name: 'session_connection_guild:do_guild_connect/1',
		},
		{
			duration_us: 2665,
			name: 'session_connection_guild_resolve:do_remote_guild_connect_attempt/4',
			remote: {
				operation: 'guild_manager',
				pod_name: 'gateway-guilds-8',
			},
		},
		{
			duration_us: 2727,
			name: 'session_connection_guild_resolve:do_remote_guild_connect_attempt/4',
			remote: {
				operation: 'guild_manager',
				pod_name: 'gateway-guilds-4',
			},
		},
		{
			duration_us: 2712,
			name: 'session_connection_guild_resolve:do_remote_guild_connect_attempt/4',
			remote: {
				operation: 'guild_manager',
				pod_name: 'gateway-guilds-4',
			},
		},
		{
			duration_us: 238,
			name: 'session_connection_guild_resolve:send_connect_cast/5',
			remote: {
				operation: 'guild',
				pod_name: 'gateway-guilds-1',
			},
		},
		{
			duration_us: 3083,
			name: 'session_connection_guild_resolve:do_remote_guild_connect_attempt/4',
			remote: {
				operation: 'guild_manager',
				pod_name: 'gateway-guilds-4',
			},
		},
		{
			duration_us: 206,
			name: 'session_connection_guild_resolve:send_connect_cast/5',
			remote: {
				operation: 'guild',
				pod_name: 'gateway-guilds-9',
			},
		},
		{
			duration_us: 3013,
			name: 'session_connection_guild:do_guild_connect/1',
		},
		{
			duration_us: 236,
			name: 'session_connection_guild_resolve:send_connect_cast/5',
			remote: {
				operation: 'guild',
				pod_name: 'gateway-guilds-3',
			},
		},
		{
			duration_us: 2959,
			name: 'session_connection_guild:do_guild_connect/1',
		},
		{
			duration_us: 183,
			name: 'session_connection_guild_resolve:send_connect_cast/5',
			remote: {
				operation: 'guild',
				pod_name: 'gateway-guilds-4',
			},
		},
		{
			duration_us: 258,
			name: 'session_connection_guild_resolve:send_connect_cast/5',
			remote: {
				operation: 'guild',
				pod_name: 'gateway-guilds-8',
			},
		},
		{
			duration_us: 379,
			name: 'session_connection_guild_resolve:send_connect_cast/5',
			remote: {
				operation: 'guild',
				pod_name: 'gateway-guilds-3',
			},
		},
		{
			duration_us: 3229,
			name: 'session_connection_guild:do_guild_connect/1',
		},
		{
			duration_us: 274,
			name: 'session_connection_guild_resolve:send_connect_cast/5',
			remote: {
				operation: 'guild',
				pod_name: 'gateway-guilds-4',
			},
		},
		{
			duration_us: 3199,
			name: 'session_connection_guild:do_guild_connect/1',
		},
		{
			duration_us: 3287,
			name: 'session_connection_guild:do_guild_connect/1',
		},
		{
			duration_us: 3195,
			name: 'session_connection_guild:do_guild_connect/1',
		},
		{
			duration_us: 1011,
			name: 'session_connection_guild_resolve:send_connect_cast/5',
			remote: {
				operation: 'guild',
				pod_name: 'gateway-guilds-11',
			},
		},
		{
			duration_us: 3541,
			name: 'session_connection_guild_resolve:do_remote_guild_connect_attempt/4',
			remote: {
				operation: 'guild_manager',
				pod_name: 'gateway-guilds-8',
			},
		},
		{
			duration_us: 3382,
			name: 'session_connection_guild:do_guild_connect/1',
		},
		{
			duration_us: 3379,
			name: 'session_connection_guild:do_guild_connect/1',
		},
		{
			duration_us: 3425,
			name: 'session_connection_guild_resolve:do_remote_guild_connect_attempt/4',
			remote: {
				operation: 'guild_manager',
				pod_name: 'gateway-guilds-9',
			},
		},
		{
			duration_us: 3632,
			name: 'session_connection_guild_resolve:do_remote_guild_connect_attempt/4',
			remote: {
				operation: 'guild_manager',
				pod_name: 'gateway-guilds-5',
			},
		},
		{
			duration_us: 251,
			name: 'session_connection_guild_resolve:send_connect_cast/5',
			remote: {
				operation: 'guild',
				pod_name: 'gateway-guilds-2',
			},
		},
		{
			duration_us: 3493,
			name: 'session_connection_guild_resolve:do_remote_guild_connect_attempt/4',
			remote: {
				operation: 'guild_manager',
				pod_name: 'gateway-guilds-5',
			},
		},
		{
			duration_us: 3371,
			name: 'session_connection_guild:do_guild_connect/1',
		},
		{
			duration_us: 3386,
			name: 'session_connection_guild_resolve:do_remote_guild_connect_attempt/4',
			remote: {
				operation: 'guild_manager',
				pod_name: 'gateway-guilds-4',
			},
		},
		{
			duration_us: 3544,
			name: 'session_connection_guild:do_guild_connect/1',
		},
		{
			duration_us: 3535,
			name: 'session_connection_guild_resolve:do_remote_guild_connect_attempt/4',
			remote: {
				operation: 'guild_manager',
				pod_name: 'gateway-guilds-5',
			},
		},
		{
			duration_us: 3502,
			name: 'session_connection_guild_resolve:do_remote_guild_connect_attempt/4',
			remote: {
				operation: 'guild_manager',
				pod_name: 'gateway-guilds-5',
			},
		},
		{
			duration_us: 3539,
			name: 'session_connection_guild_resolve:do_remote_guild_connect_attempt/4',
			remote: {
				operation: 'guild_manager',
				pod_name: 'gateway-guilds-5',
			},
		},
		{
			duration_us: 728,
			name: 'session_connection_guild_resolve:send_connect_cast/5',
			remote: {
				operation: 'guild',
				pod_name: 'gateway-guilds-1',
			},
		},
		{
			duration_us: 3545,
			name: 'session_connection_guild:do_guild_connect/1',
		},
		{
			duration_us: 549,
			name: 'session_connection_guild_resolve:send_connect_cast/5',
			remote: {
				operation: 'guild',
				pod_name: 'gateway-guilds-8',
			},
		},
		{
			duration_us: 262,
			name: 'session_connection_guild_resolve:send_connect_cast/5',
			remote: {
				operation: 'guild',
				pod_name: 'gateway-guilds-8',
			},
		},
		{
			duration_us: 127,
			name: 'session_connection_guild_resolve:send_connect_cast/5',
			remote: {
				operation: 'guild',
				pod_name: 'gateway-guilds-5',
			},
		},
		{
			duration_us: 245,
			name: 'session_connection_guild_resolve:send_connect_cast/5',
			remote: {
				operation: 'guild',
				pod_name: 'gateway-guilds-5',
			},
		},
		{
			duration_us: 248,
			name: 'session_connection_guild_resolve:send_connect_cast/5',
			remote: {
				operation: 'guild',
				pod_name: 'gateway-guilds-9',
			},
		},
		{
			duration_us: 4051,
			name: 'session_connection_guild:do_guild_connect/1',
		},
		{
			duration_us: 3908,
			name: 'session_connection_guild:do_guild_connect/1',
		},
		{
			duration_us: 664,
			name: 'session_connection_guild_resolve:send_connect_cast/5',
			remote: {
				operation: 'guild',
				pod_name: 'gateway-guilds-4',
			},
		},
		{
			duration_us: 4090,
			name: 'session_connection_guild:do_guild_connect/1',
		},
		{
			duration_us: 3950,
			name: 'session_connection_guild:do_guild_connect/1',
		},
		{
			duration_us: 267,
			name: 'session_connection_guild_resolve:send_connect_cast/5',
			remote: {
				operation: 'guild',
				pod_name: 'gateway-guilds-4',
			},
		},
		{
			duration_us: 4062,
			name: 'session_connection_guild:do_guild_connect/1',
		},
		{
			duration_us: 326,
			name: 'session_connection_guild_resolve:send_connect_cast/5',
			remote: {
				operation: 'guild',
				pod_name: 'gateway-guilds-5',
			},
		},
		{
			duration_us: 4281,
			name: 'session_connection_guild:do_guild_connect/1',
		},
		{
			duration_us: 202,
			name: 'session_connection_guild_resolve:send_connect_cast/5',
			remote: {
				operation: 'guild',
				pod_name: 'gateway-guilds-5',
			},
		},
		{
			duration_us: 4165,
			name: 'session_connection_guild:do_guild_connect/1',
		},
		{
			duration_us: 321,
			name: 'session_connection_guild_resolve:send_connect_cast/5',
			remote: {
				operation: 'guild',
				pod_name: 'gateway-guilds-5',
			},
		},
		{
			duration_us: 3982,
			name: 'session_connection_guild:do_guild_connect/1',
		},
		{
			duration_us: 4127,
			name: 'session_connection_guild:do_guild_connect/1',
		},
		{
			duration_us: 4185,
			name: 'session_connection_guild:do_guild_connect/1',
		},
		{
			duration_us: 4197,
			name: 'session_connection_guild:do_guild_connect/1',
		},
		{
			duration_us: 2013,
			name: 'session_connection_guild_resolve:do_remote_guild_connect_attempt/4',
			remote: {
				operation: 'guild_manager',
				pod_name: 'gateway-guilds-9',
			},
		},
		{
			duration_us: 2128,
			name: 'session_connection_guild_resolve:do_remote_guild_connect_attempt/4',
			remote: {
				operation: 'guild_manager',
				pod_name: 'gateway-guilds-3',
			},
		},
		{
			duration_us: 259,
			name: 'session_connection_guild_resolve:send_connect_cast/5',
			remote: {
				operation: 'guild',
				pod_name: 'gateway-guilds-9',
			},
		},
		{
			duration_us: 275,
			name: 'session_connection_guild_resolve:send_connect_cast/5',
			remote: {
				operation: 'guild',
				pod_name: 'gateway-guilds-3',
			},
		},
		{
			duration_us: 2634,
			name: 'session_connection_guild:do_guild_connect/1',
		},
		{
			duration_us: 2609,
			name: 'session_connection_guild:do_guild_connect/1',
		},
		{
			children: [
				{
					duration_us: 76883,
					name: 'session_ready_collect:collect_ready_presences/2',
				},
				{
					duration_us: 651,
					name: 'session_ready_collect:collect_ready_users/2',
				},
				{
					duration_us: 243,
					name: 'session_ready_dispatch:build_final_ready_data/9',
				},
			],
			duration_us: 77988,
			name: 'session_ready_dispatch:dispatch_ready_to_socket/1',
		},
	],
	unit: 'microseconds',
};
