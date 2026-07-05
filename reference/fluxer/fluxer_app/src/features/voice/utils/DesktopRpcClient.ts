// SPDX-License-Identifier: AGPL-3.0-or-later

import Config from '@app/features/app/config/Config';

const RPC_PORT_STABLE = 21863;
const RPC_PORT_CANARY = 21864;
const RPC_PORTS =
	Config.PUBLIC_RELEASE_CHANNEL === 'canary' ? [RPC_PORT_CANARY, RPC_PORT_STABLE] : [RPC_PORT_STABLE, RPC_PORT_CANARY];

interface RpcResponse<T = unknown> {
	success: boolean;
	data?: T;
	error?: string;
}

interface HealthResponse {
	status: string;
	channel: string;
	version: string;
	platform: string;
}

interface NavigateResponse {
	navigated: boolean;
	path: string;
}

let cachedAvailablePort: number | null = null;
let lastHealthCheck = 0;

const HEALTH_CHECK_CACHE_MS = 5000;

async function rpcFetch<T>(port: number, endpoint: string, options?: RequestInit): Promise<RpcResponse<T> | null> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 2000);
	try {
		const response = await fetch(`http://127.0.0.1:${port}${endpoint}`, {
			...options,
			signal: controller.signal,
		});
		return (await response.json()) as RpcResponse<T>;
	} catch {
		return null;
	} finally {
		clearTimeout(timeout);
	}
}

export async function checkDesktopAvailable(): Promise<{
	available: boolean;
	port: number | null;
	info: HealthResponse | null;
}> {
	const now = Date.now();
	if (cachedAvailablePort !== null && now - lastHealthCheck < HEALTH_CHECK_CACHE_MS) {
		const result = await rpcFetch<HealthResponse>(cachedAvailablePort, '/health');
		if (result?.success && result.data) {
			return {available: true, port: cachedAvailablePort, info: result.data};
		}
		cachedAvailablePort = null;
	}
	for (const port of RPC_PORTS) {
		const result = await rpcFetch<HealthResponse>(port, '/health');
		if (result?.success && result.data) {
			cachedAvailablePort = port;
			lastHealthCheck = now;
			return {available: true, port, info: result.data};
		}
	}
	cachedAvailablePort = null;
	return {available: false, port: null, info: null};
}

export async function navigateInDesktop(path: string): Promise<{
	success: boolean;
	error?: string;
}> {
	const {available, port} = await checkDesktopAvailable();
	if (!available || port === null) {
		return {success: false, error: 'desktop_unavailable'};
	}
	const result = await rpcFetch<NavigateResponse>(port, '/navigate', {
		method: 'POST',
		headers: {'Content-Type': 'application/json'},
		body: JSON.stringify({method: 'navigate', params: {path}}),
	});
	if (!result) {
		return {success: false, error: 'desktop_rpc_unreachable'};
	}
	if (!result.success) {
		return {success: false, error: result.error ?? 'desktop_rpc_unknown'};
	}
	return {success: true};
}

export async function focusDesktop(): Promise<{
	success: boolean;
	error?: string;
}> {
	const {available, port} = await checkDesktopAvailable();
	if (!available || port === null) {
		return {success: false, error: 'desktop_unavailable'};
	}
	const result = await rpcFetch(port, '/focus', {method: 'POST'});
	if (!result) {
		return {success: false, error: 'desktop_rpc_unreachable'};
	}
	if (!result.success) {
		return {success: false, error: result.error ?? 'desktop_rpc_unknown'};
	}
	return {success: true};
}

export function resetDesktopRpcCache(): void {
	cachedAvailablePort = null;
	lastHealthCheck = 0;
}
