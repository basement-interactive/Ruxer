// SPDX-License-Identifier: AGPL-3.0-or-later

import {Endpoints} from '@app/features/app/constants/Endpoints';
import {http} from '@app/features/platform/transport/RestTransport';
import {Logger} from '@app/features/platform/utils/AppLogger';

const logger = new Logger('MatureContentCheck');

interface MatureContentCheckSession {
	url: string;
}

async function requestMatureContentCheckSession(): Promise<MatureContentCheckSession> {
	const response = await http.post<MatureContentCheckSession>(Endpoints.AGE_VERIFICATION);
	return response.body;
}

function sessionUrlFrom(response: MatureContentCheckSession): string {
	return response.url;
}

function rethrowSessionFailure(error: unknown): never {
	logger.error('Mature content check session creation failed', error);
	throw error;
}

export async function createMatureContentCheckSession(): Promise<string> {
	try {
		const session = await requestMatureContentCheckSession();
		logger.info('Mature content check session created');
		return sessionUrlFrom(session);
	} catch (error) {
		rethrowSessionFailure(error);
	}
}
