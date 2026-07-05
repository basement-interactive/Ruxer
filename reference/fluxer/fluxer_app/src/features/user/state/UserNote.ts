// SPDX-License-Identifier: AGPL-3.0-or-later

import {Logger} from '@app/features/platform/utils/AppLogger';
import {makeAutoObservable} from 'mobx';

const logger = new Logger('UserNote');

class UserNote {
	notes: Record<string, string> = {};

	constructor() {
		makeAutoObservable(this, {}, {autoBind: true});
	}

	loadNotes(notes: Record<string, string>): void {
		logger.debug('Loading user notes');
		this.notes = {...notes};
	}

	updateUserNote(userId: string, note: string): void {
		if (!note) {
			const {[userId]: _, ...remainingNotes} = this.notes;
			this.notes = remainingNotes;
			logger.debug(`Removed note for user ${userId}`);
		} else if (this.notes[userId] !== note) {
			this.notes = {
				...this.notes,
				[userId]: note,
			};
			logger.debug(`Updated note for user ${userId}`);
		}
	}

	clearNote(userId: string): void {
		this.updateUserNote(userId, '');
	}

	getUserNote(userId: string): string {
		return this.notes[userId] ?? '';
	}

	hasNote(userId: string): boolean {
		return userId in this.notes && this.notes[userId].length > 0;
	}
}

export default new UserNote();
