// SPDX-License-Identifier: AGPL-3.0-or-later

import {Endpoints} from '@app/features/app/constants/Endpoints';
import {http} from '@app/features/platform/transport/RestTransport';
import {Logger} from '@app/features/platform/utils/AppLogger';
import type {PackDashboardResponse, PackSummaryResponse} from '@fluxer/schema/src/domains/pack/PackSchemas';

const logger = new Logger('Packs');

type PackType = 'emoji' | 'sticker';

interface PackCreateRequest {
	name: string;
	description: string | null;
}

interface PackUpdateRequest {
	name?: string;
	description?: string | null;
}

function packCreateRequest(name: string, description?: string | null): PackCreateRequest {
	return {name, description: description ?? null};
}

export async function list(): Promise<PackDashboardResponse> {
	try {
		logger.debug('Requesting pack dashboard');
		const response = await http.get<PackDashboardResponse>(Endpoints.PACKS);
		return response.body;
	} catch (error) {
		logger.error('Failed to fetch pack dashboard:', error);
		throw error;
	}
}

export async function create(type: PackType, name: string, description?: string | null): Promise<PackSummaryResponse> {
	try {
		logger.debug(`Creating ${type} pack ${name}`);
		const response = await http.post<PackSummaryResponse>(Endpoints.PACK_CREATE(type), {
			body: packCreateRequest(name, description),
		});
		return response.body;
	} catch (error) {
		logger.error(`Failed to create ${type} pack:`, error);
		throw error;
	}
}

export async function update(packId: string, data: PackUpdateRequest): Promise<PackSummaryResponse> {
	try {
		logger.debug(`Updating pack ${packId}`);
		const response = await http.patch<PackSummaryResponse>(Endpoints.PACK(packId), {body: data});
		return response.body;
	} catch (error) {
		logger.error(`Failed to update pack ${packId}:`, error);
		throw error;
	}
}

export async function remove(packId: string): Promise<void> {
	try {
		logger.debug(`Deleting pack ${packId}`);
		await http.delete(Endpoints.PACK(packId));
	} catch (error) {
		logger.error(`Failed to delete pack ${packId}:`, error);
		throw error;
	}
}

export async function install(packId: string): Promise<void> {
	try {
		logger.debug(`Installing pack ${packId}`);
		await http.post(Endpoints.PACK_INSTALL(packId));
	} catch (error) {
		logger.error(`Failed to install pack ${packId}:`, error);
		throw error;
	}
}

export async function uninstall(packId: string): Promise<void> {
	try {
		logger.debug(`Uninstalling pack ${packId}`);
		await http.delete(Endpoints.PACK_INSTALL(packId));
	} catch (error) {
		logger.error(`Failed to uninstall pack ${packId}:`, error);
		throw error;
	}
}
