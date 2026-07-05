// SPDX-License-Identifier: AGPL-3.0-or-later

import type {Message} from '@fluxer/schema/src/domains/message/MessageResponseSchemas';
import {action, makeAutoObservable} from 'mobx';

type TypingEntry = Readonly<{
	expiresAt: number;
}>;

type TypingEntriesByChannel = Record<string, Record<string, TypingEntry>>;
type TypingUsersCacheEntry = Readonly<{
	users: ReadonlyArray<string>;
	expiresAt: number | null;
}>;

export const TYPING_INDICATOR_TIMEOUT_MS = 10000;
const EMPTY_TYPING_USERS: ReadonlyArray<string> = Object.freeze([]);

class TypingIndicator {
	remoteTypingUsersByChannel: TypingEntriesByChannel = {};
	localTypingUsersByChannel: TypingEntriesByChannel = {};
	private typingUsersCacheByChannel: Record<string, TypingUsersCacheEntry | undefined> = {};
	private expiryTimerId: NodeJS.Timeout | null = null;

	constructor() {
		makeAutoObservable<this, 'typingUsersCacheByChannel' | 'expiryTimerId'>(
			this,
			{
				expiryTimerId: false,
				typingUsersCacheByChannel: false,
			},
			{autoBind: true},
		);
	}

	getTypingUsers(channelId: string): ReadonlyArray<string> {
		const now = Date.now();
		const cached = this.typingUsersCacheByChannel[channelId];
		if (cached && (cached.expiresAt === null || cached.expiresAt > now)) {
			return cached.users;
		}
		const {expiresAt, users} = this.collectTypingUsers(channelId, now);
		const typedUsers = users.length === 0 ? EMPTY_TYPING_USERS : Object.freeze(users);
		this.typingUsersCacheByChannel[channelId] = {
			expiresAt,
			users: typedUsers,
		};
		return typedUsers;
	}

	getCount(channelId: string): number {
		return this.getTypingUsers(channelId).length;
	}

	isTyping(channelId: string, userId: string): boolean {
		return this.isRemoteTyping(channelId, userId) || this.isLocalTyping(channelId, userId);
	}

	isMemberListTyping(channelId: string, userId: string, currentUserId: string | null | undefined): boolean {
		if (currentUserId && userId === currentUserId) {
			return this.isLocalTyping(channelId, userId);
		}
		return this.isTyping(channelId, userId);
	}

	isLocalTyping(channelId: string, userId: string): boolean {
		return this.hasActiveTypingEntry(this.localTypingUsersByChannel, channelId, userId, Date.now());
	}

	isRemoteTyping(channelId: string, userId: string): boolean {
		return this.hasActiveTypingEntry(this.remoteTypingUsersByChannel, channelId, userId, Date.now());
	}

	private collectTypingUsers(channelId: string, now: number): {users: Array<string>; expiresAt: number | null} {
		const users: Array<string> = [];
		const seen = new Set<string>();
		let expiresAt: number | null = null;
		const collect = (entries: Record<string, TypingEntry> | undefined) => {
			if (!entries) return;
			for (const [userId, entry] of Object.entries(entries)) {
				if (entry.expiresAt <= now) {
					continue;
				}
				if (!seen.has(userId)) {
					seen.add(userId);
					users.push(userId);
				}
				expiresAt = expiresAt === null ? entry.expiresAt : Math.min(expiresAt, entry.expiresAt);
			}
		};
		collect(this.remoteTypingUsersByChannel[channelId]);
		collect(this.localTypingUsersByChannel[channelId]);
		return {expiresAt, users};
	}

	private hasActiveTypingEntry(
		entriesByChannel: TypingEntriesByChannel,
		channelId: string,
		userId: string,
		now: number,
	): boolean {
		const entry = entriesByChannel[channelId]?.[userId];
		return entry !== undefined && entry.expiresAt > now;
	}

	private upsertTypingEntry(entriesByChannel: TypingEntriesByChannel, channelId: string, userId: string): void {
		const now = Date.now();
		this.removeExpiredTypingEntries(now);
		if (!entriesByChannel[channelId]) {
			entriesByChannel[channelId] = {};
		}
		const channelUsers = entriesByChannel[channelId];
		const existingEntry = channelUsers[userId];
		const wasVisible = existingEntry !== undefined && existingEntry.expiresAt > now;
		channelUsers[userId] = {
			expiresAt: now + TYPING_INDICATOR_TIMEOUT_MS,
		};
		if (!wasVisible) {
			this.invalidateTypingUsers(channelId);
		}
		this.scheduleNextExpiryTimer(now);
	}

	private removeTypingEntry(entriesByChannel: TypingEntriesByChannel, channelId: string, userId: string): void {
		const channelUsers = entriesByChannel[channelId];
		if (!channelUsers?.[userId]) {
			return;
		}
		delete channelUsers[userId];
		if (Object.keys(channelUsers).length === 0) {
			delete entriesByChannel[channelId];
		}
		this.invalidateTypingUsers(channelId);
		this.scheduleNextExpiryTimer(Date.now());
	}

	private removeExpiredTypingEntries(now: number): void {
		this.removeExpiredTypingEntriesFrom(this.remoteTypingUsersByChannel, now);
		this.removeExpiredTypingEntriesFrom(this.localTypingUsersByChannel, now);
	}

	private removeExpiredTypingEntriesFrom(entriesByChannel: TypingEntriesByChannel, now: number): void {
		for (const [channelId, channelUsers] of Object.entries(entriesByChannel)) {
			let removed = false;
			for (const [userId, entry] of Object.entries(channelUsers)) {
				if (entry.expiresAt > now) {
					continue;
				}
				delete channelUsers[userId];
				removed = true;
			}
			if (Object.keys(channelUsers).length === 0) {
				delete entriesByChannel[channelId];
			}
			if (removed) {
				this.invalidateTypingUsers(channelId);
			}
		}
	}

	private getNextExpiresAt(now: number): number | null {
		let nextExpiresAt: number | null = null;
		const collect = (entriesByChannel: TypingEntriesByChannel) => {
			for (const channelUsers of Object.values(entriesByChannel)) {
				for (const entry of Object.values(channelUsers)) {
					if (entry.expiresAt <= now) {
						continue;
					}
					nextExpiresAt = nextExpiresAt === null ? entry.expiresAt : Math.min(nextExpiresAt, entry.expiresAt);
				}
			}
		};
		collect(this.remoteTypingUsersByChannel);
		collect(this.localTypingUsersByChannel);
		return nextExpiresAt;
	}

	private scheduleNextExpiryTimer(now: number): void {
		this.clearExpiryTimer();
		const nextExpiresAt = this.getNextExpiresAt(now);
		if (nextExpiresAt === null) {
			return;
		}
		this.expiryTimerId = setTimeout(
			() => {
				this.expiryTimerId = null;
				this.pruneExpiredTypingUsers();
			},
			Math.max(0, nextExpiresAt - now),
		);
	}

	private clearExpiryTimer(): void {
		if (!this.expiryTimerId) {
			return;
		}
		clearTimeout(this.expiryTimerId);
		this.expiryTimerId = null;
	}

	private invalidateTypingUsers(channelId: string): void {
		delete this.typingUsersCacheByChannel[channelId];
	}

	@action
	pruneExpiredTypingUsers(now = Date.now()): void {
		this.removeExpiredTypingEntries(now);
		this.scheduleNextExpiryTimer(now);
	}

	@action
	reset(): void {
		this.clearExpiryTimer();
		this.remoteTypingUsersByChannel = {};
		this.localTypingUsersByChannel = {};
		this.typingUsersCacheByChannel = {};
	}

	@action
	startTyping(channelId: string, userId: string): void {
		this.startRemoteTyping(channelId, userId);
	}

	@action
	startRemoteTyping(channelId: string, userId: string): void {
		this.upsertTypingEntry(this.remoteTypingUsersByChannel, channelId, userId);
	}

	@action
	stopTyping(channelId: string, userId: string): void {
		this.stopLocalTyping(channelId, userId);
		this.stopRemoteTyping(channelId, userId);
	}

	@action
	startLocalTyping(channelId: string, userId: string): void {
		this.upsertTypingEntry(this.localTypingUsersByChannel, channelId, userId);
	}

	@action
	stopLocalTyping(channelId: string, userId: string): void {
		this.removeTypingEntry(this.localTypingUsersByChannel, channelId, userId);
	}

	@action
	stopRemoteTyping(channelId: string, userId: string): void {
		this.removeTypingEntry(this.remoteTypingUsersByChannel, channelId, userId);
	}

	@action
	stopTypingOnMessageCreate(message: Message): void {
		this.stopTyping(message.channel_id, message.author.id);
	}
}

export default new TypingIndicator();
