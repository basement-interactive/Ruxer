// SPDX-License-Identifier: AGPL-3.0-or-later

import EventEmitter from 'eventemitter3';

interface CustomStatusEvents {
	presenceChange: (userId: string) => void;
	memberListChange: (guildId: string, listId: string, userId: string) => void;
}

class CustomStatusEmitterClass extends EventEmitter<CustomStatusEvents> {
	emitPresenceChange(userId: string): void {
		this.emit('presenceChange', userId);
	}

	emitMemberListChange(guildId: string, listId: string, userId: string): void {
		this.emit('memberListChange', guildId, listId, userId);
	}

	subscribeToPresence(userId: string, callback: () => void): () => void {
		const handler = (changedUserId: string) => {
			if (changedUserId === userId) {
				callback();
			}
		};
		this.on('presenceChange', handler);
		return () => this.off('presenceChange', handler);
	}

	subscribeToMemberList(guildId: string, listId: string, userId: string, callback: () => void): () => void {
		const handler = (g: string, l: string, u: string) => {
			if (g === guildId && l === listId && u === userId) {
				callback();
			}
		};
		this.on('memberListChange', handler);
		return () => this.off('memberListChange', handler);
	}
}

export const CustomStatusEmitter = new CustomStatusEmitterClass();
