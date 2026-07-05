// SPDX-License-Identifier: AGPL-3.0-or-later

import {Endpoints} from '@app/features/app/constants/Endpoints';
import {http} from '@app/features/platform/transport/RestTransport';
import {Logger} from '@app/features/platform/utils/AppLogger';

const logger = new Logger('Notes');

interface UserNotePayload {
	note: string | null;
}

function notePayload(note: string | null): UserNotePayload {
	return {note};
}

async function persistUserNote(userId: string, note: string | null): Promise<void> {
	await http.put(Endpoints.USER_NOTE(userId), {body: notePayload(note)});
}

function describeNoteChange(note: string | null): string {
	return note ? 'new value' : 'null';
}

function rethrowNoteUpdateFailure(userId: string, error: unknown): never {
	logger.error(`Failed to update note for user ${userId}:`, error);
	throw error;
}

export async function update(userId: string, note: string | null): Promise<void> {
	try {
		await persistUserNote(userId, note);
		logger.debug(`Updated note for user ${userId} to ${describeNoteChange(note)}`);
	} catch (error) {
		rethrowNoteUpdateFailure(userId, error);
	}
}
