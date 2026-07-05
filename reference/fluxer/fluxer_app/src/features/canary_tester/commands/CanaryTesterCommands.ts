// SPDX-License-Identifier: AGPL-3.0-or-later

import {Endpoints} from '@app/features/app/constants/Endpoints';
import {http} from '@app/features/platform/transport/RestTransport';
import {Logger} from '@app/features/platform/utils/AppLogger';

const logger = new Logger('CanaryTester');

interface CanaryTesterJoinResponse {
	success: true;
}

const JOIN_REQUEST_BODY = {};

async function submitCanaryTesterJoin(): Promise<void> {
	await http.post<CanaryTesterJoinResponse>(Endpoints.CANARY_TESTER_JOIN, {
		body: JOIN_REQUEST_BODY,
	});
}

function rethrowJoinFailure(error: unknown): never {
	logger.error('Failed to join Fluxer Testers guild:', error);
	throw error;
}

export async function joinCanaryTesters(): Promise<void> {
	try {
		await submitCanaryTesterJoin();
	} catch (error) {
		rethrowJoinFailure(error);
	}
}
