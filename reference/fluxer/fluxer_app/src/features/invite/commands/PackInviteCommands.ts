// SPDX-License-Identifier: AGPL-3.0-or-later

import {Endpoints} from '@app/features/app/constants/Endpoints';
import {http} from '@app/features/platform/transport/RestTransport';
import {Logger} from '@app/features/platform/utils/AppLogger';
import type {PackInviteMetadataResponse} from '@fluxer/schema/src/domains/invite/InviteSchemas';

const logger = new Logger('PackInvites');

export interface CreatePackInviteParams {
	packId: string;
	maxUses?: number;
	maxAge?: number;
	unique?: boolean;
}

interface PackInviteRequestBody {
	max_uses: number;
	max_age: number;
	unique: boolean;
}

function packInviteRequestBody(params: CreatePackInviteParams): PackInviteRequestBody {
	return {
		max_uses: params.maxUses ?? 0,
		max_age: params.maxAge ?? 0,
		unique: params.unique ?? false,
	};
}

async function requestPackInvite(params: CreatePackInviteParams): Promise<PackInviteMetadataResponse> {
	const response = await http.post<PackInviteMetadataResponse>(Endpoints.PACK_INVITES(params.packId), {
		body: packInviteRequestBody(params),
	});
	return response.body;
}

function rethrowPackInviteFailure(packId: string, error: unknown): never {
	logger.error(`Failed to create invite for pack ${packId}:`, error);
	throw error;
}

export async function createInvite(params: CreatePackInviteParams): Promise<PackInviteMetadataResponse> {
	try {
		logger.debug(`Creating invite for pack ${params.packId}`);
		return await requestPackInvite(params);
	} catch (error) {
		rethrowPackInviteFailure(params.packId, error);
	}
}
