// SPDX-License-Identifier: AGPL-3.0-or-later

import {Endpoints} from '@app/features/app/constants/Endpoints';
import AuthSession from '@app/features/auth/state/AuthSession';
import {http} from '@app/features/platform/transport/RestTransport';
import {Logger} from '@app/features/platform/utils/AppLogger';
import type {AuthSessionResponse} from '@fluxer/schema/src/domains/auth/AuthSchemas';

const logger = new Logger('AuthSessionsService');

type SessionIdHashes = ReadonlyArray<string>;

async function requestAuthSessions(): Promise<Array<AuthSessionResponse>> {
	const response = await http.get<Array<AuthSessionResponse>>(Endpoints.AUTH_SESSIONS, {retries: 2});
	return response.body ?? [];
}

function recordFetchFailure(error: unknown): never {
	logger.error('Failed to fetch authentication sessions:', error);
	AuthSession.fetchError();
	throw error;
}

function logoutPayload(sessionIdHashes: SessionIdHashes): {session_id_hashes: Array<string>} {
	return {session_id_hashes: [...sessionIdHashes]};
}

async function requestSessionLogout(sessionIdHashes: SessionIdHashes): Promise<void> {
	await http.post(Endpoints.AUTH_SESSIONS_LOGOUT, {
		body: logoutPayload(sessionIdHashes),
		timeoutMs: 10000,
		retries: 0,
	});
}

function recordLogoutFailure(error: unknown): never {
	logger.error('Failed to log out sessions:', error);
	AuthSession.logoutError();
	throw error;
}

export async function fetch(): Promise<void> {
	logger.debug('Fetching authentication sessions');
	AuthSession.fetchPending();
	try {
		const sessions = await requestAuthSessions();
		logger.info(`Fetched ${sessions.length} authentication sessions`);
		AuthSession.fetchSuccess(sessions);
	} catch (error) {
		recordFetchFailure(error);
	}
}

export async function logout(sessionIdHashes: SessionIdHashes): Promise<void> {
	if (!sessionIdHashes.length) {
		logger.warn('Attempted to logout with empty session list');
		return;
	}
	logger.debug(`Logging out ${sessionIdHashes.length} sessions`);
	AuthSession.logoutPending();
	try {
		await requestSessionLogout(sessionIdHashes);
		logger.info(`Successfully logged out ${sessionIdHashes.length} sessions`);
		AuthSession.logoutSuccess([...sessionIdHashes]);
	} catch (error) {
		recordLogoutFailure(error);
	}
}
