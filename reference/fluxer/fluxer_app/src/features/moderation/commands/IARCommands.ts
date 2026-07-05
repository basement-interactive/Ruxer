// SPDX-License-Identifier: AGPL-3.0-or-later

import {Endpoints} from '@app/features/app/constants/Endpoints';
import DeveloperOptions from '@app/features/devtools/state/DeveloperOptions';
import {http} from '@app/features/platform/transport/RestTransport';
import {Logger} from '@app/features/platform/utils/AppLogger';

const logger = new Logger('IAR');

type ReportKind = 'message' | 'user' | 'guild';

async function submitReport(endpoint: string, body: Record<string, unknown>): Promise<void> {
	await http.post(endpoint, {body});
}

function rethrowReportFailure(kind: ReportKind, error: unknown): never {
	logger.error(`Failed to submit ${kind} report:`, error);
	throw error;
}

function shouldSkipReport(): boolean {
	if (DeveloperOptions.noOpInAppReports) {
		logger.info('No-op in-app reports is enabled; skipping network call.');
		return true;
	}
	return false;
}

export async function reportMessage(channelId: string, messageId: string, category: string): Promise<void> {
	if (shouldSkipReport()) return;
	try {
		await submitReport(Endpoints.REPORT_MESSAGE, {
			category,
			channel_id: channelId,
			message_id: messageId,
		});
	} catch (error) {
		rethrowReportFailure('message', error);
	}
}

export async function reportUser(userId: string, category: string, guildId?: string): Promise<void> {
	if (shouldSkipReport()) return;
	try {
		await submitReport(Endpoints.REPORT_USER, {
			category,
			user_id: userId,
			...(guildId ? {guild_id: guildId} : {}),
		});
	} catch (error) {
		rethrowReportFailure('user', error);
	}
}

export async function reportGuild(guildId: string, category: string, inviteCode?: string): Promise<void> {
	if (shouldSkipReport()) return;
	try {
		await submitReport(Endpoints.REPORT_GUILD, {
			category,
			guild_id: guildId,
			...(inviteCode ? {invite_code: inviteCode} : {}),
		});
	} catch (error) {
		rethrowReportFailure('guild', error);
	}
}
