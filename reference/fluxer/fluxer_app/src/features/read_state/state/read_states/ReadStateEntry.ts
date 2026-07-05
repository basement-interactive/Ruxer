// SPDX-License-Identifier: AGPL-3.0-or-later

import Channels from '@app/features/channel/state/Channels';
import GuildMembers from '@app/features/member/state/GuildMembers';
import type {Message as MessageModel} from '@app/features/messaging/models/MessagingMessage';
import Messages from '@app/features/messaging/state/MessagingMessages';
import {resolveReadStateEntryStatus} from '@app/features/read_state/state/read_states/ReadStateEntryStatusMachine';
import {resolveReadStateMention} from '@app/features/read_state/state/read_states/ReadStateMentionMachine';
import {compareMessageIds, normalizeCount, snowflakeTimestamp} from '@app/features/read_state/state/read_states/shared';
import Relationships from '@app/features/relationship/state/Relationships';
import UserGuildSettings from '@app/features/user/state/UserGuildSettings';
import Users from '@app/features/user/state/Users';
import {ChannelTypes} from '@fluxer/constants/src/ChannelConstants';
import type {Message as WireMessage} from '@fluxer/schema/src/domains/message/MessageResponseSchemas';

export class ReadStateEntry {
	readonly channelId: string;
	_guildId: string | null = null;
	loadedMessages = false;
	readStateKnown = false;
	private _lastMessageId: string | null = null;
	private _lastMessageTimestamp = 0;
	private _ackMessageId: string | null = null;
	private _ackMessageTimestamp = 0;
	ackPinTimestamp = 0;
	lastPinTimestamp = 0;
	isManualAck = false;
	private _oldestUnreadMessageId: string | null = null;
	oldestUnreadMessageIdStale = false;
	private _stickyUnreadMessageId: string | null = null;
	estimated = false;
	private _unreadCount = 0;
	private _mentionCount = 0;
	outgoingAck: string | null = null;
	serverVersion: string | null = null;
	snapshot?: {
		unread: boolean;
		mentionCount: number;
		guildUnread: boolean | null;
		guildMentionCount: number | null;
		takenAt: number;
	};

	constructor(channelId: string) {
		this.channelId = channelId;
	}

	get guildId(): string | null {
		const channel = Channels.getChannel(this.channelId);
		return channel?.guildId ?? this._guildId ?? null;
	}

	get lastMessageId(): string | null {
		return this._lastMessageId;
	}

	set lastMessageId(messageId: string | null) {
		this._lastMessageId = messageId;
		this._lastMessageTimestamp = snowflakeTimestamp(messageId);
	}

	get lastMessageTimestamp(): number {
		return this._lastMessageTimestamp;
	}

	get ackMessageId(): string | null {
		return this._ackMessageId;
	}

	set ackMessageId(messageId: string | null) {
		this._ackMessageId = messageId;
		this._ackMessageTimestamp = snowflakeTimestamp(messageId);
	}

	get oldestUnreadMessageId(): string | null {
		return this._oldestUnreadMessageId;
	}

	set oldestUnreadMessageId(messageId: string | null) {
		this._oldestUnreadMessageId = messageId;
		this.oldestUnreadMessageIdStale = false;
	}

	get stickyUnreadMessageId(): string | null {
		return this._stickyUnreadMessageId;
	}

	set stickyUnreadMessageId(messageId: string | null) {
		this._stickyUnreadMessageId = messageId;
	}

	get visualUnreadMessageId(): string | null {
		return this._stickyUnreadMessageId ?? this._oldestUnreadMessageId;
	}

	clearStickyUnread(): void {
		this._stickyUnreadMessageId = null;
	}

	get unreadCount(): number {
		return this._unreadCount;
	}

	set unreadCount(count: number) {
		this._unreadCount = normalizeCount(count);
	}

	get mentionCount(): number {
		return this._mentionCount;
	}

	set mentionCount(count: number) {
		this._mentionCount = normalizeCount(count);
	}

	get oldestUnreadTimestamp(): number {
		return snowflakeTimestamp(this.oldestUnreadMessageId);
	}

	get ackTimestamp(): number {
		if (Number.isNaN(this._ackMessageTimestamp)) {
			return 0;
		}
		return this._ackMessageTimestamp;
	}

	get isPrivate(): boolean {
		const channel = Channels.getChannel(this.channelId);
		return channel?.isPrivate() ?? false;
	}

	canTrackUnreads(): boolean {
		return Channels.getChannel(this.channelId) != null || this._guildId != null;
	}

	private get statusModel() {
		return resolveReadStateEntryStatus({
			canTrackUnreads: this.canTrackUnreads(),
			hasBlockedDirectMessageRecipient: this.hasBlockedDirectMessageRecipient(),
			readStateKnown: this.readStateKnown,
			lastMessageId: this._lastMessageId,
			ackMessageId: this._ackMessageId,
			mentionCount: this.mentionCount,
		});
	}

	canBeUnread(): boolean {
		return this.statusModel.canBeUnread;
	}

	canHaveMentions(): boolean {
		return this.statusModel.canHaveMentions;
	}

	hasUnread(): boolean {
		return this.statusModel.hasUnread;
	}

	private hasBlockedDirectMessageRecipient(): boolean {
		const channel = Channels.getChannel(this.channelId);
		if (channel?.type !== ChannelTypes.DM) {
			return false;
		}
		const recipientId = channel.getRecipientId();
		return recipientId != null && Relationships.isBlocked(recipientId);
	}

	hasMentions(): boolean {
		return this.mentionCount > 0;
	}

	hasUnreadOrMentions(): boolean {
		return this.statusModel.hasUnreadOrMentions;
	}

	getGuildChannelUnreadState(
		channel: {
			isPrivate(): boolean;
			guildId?: string;
		},
		_isOptInEnabled: boolean,
		isChannelMuted: boolean,
		isGuildMuted: boolean,
	): {
		mentionCount: number;
		unread: boolean;
	} {
		if (!channel.isPrivate() && !this.canTrackUnreads()) {
			return {mentionCount: 0, unread: false};
		}
		const mentionCount = this.canHaveMentions() ? this.mentionCount : 0;
		if (isChannelMuted || isGuildMuted) {
			return {mentionCount, unread: false};
		}
		return {
			mentionCount,
			unread: this.hasUnread(),
		};
	}

	rebuild(
		ackMessageId?: string | null,
		{
			recomputeMentions = false,
		}: {
			recomputeMentions?: boolean;
		} = {},
	): void {
		const previousUnreadCount = this._unreadCount;
		if (ackMessageId !== undefined) {
			this.ackMessageId = ackMessageId;
			this.readStateKnown = true;
		} else {
			this.ackMessageId = this._ackMessageId;
		}
		this.oldestUnreadMessageId = null;
		this.estimated = false;
		this.unreadCount = 0;
		if (recomputeMentions) {
			this.mentionCount = 0;
		}
		if (!this.hasUnread()) {
			return;
		}
		const currentUser = Users.getCurrentUser();
		if (currentUser == null) {
			return;
		}
		const messages = Messages.getMessages(this.channelId);
		const isPrivate = this.isPrivate;
		const userId = currentUser.id;
		const guildId = this.guildId;
		const channelId = this.channelId;
		const suppressEveryone = recomputeMentions ? UserGuildSettings.isSuppressEveryoneEnabled(guildId) : false;
		const suppressRoles = recomputeMentions ? UserGuildSettings.isSuppressRolesEnabled(guildId) : false;
		const isMuted = recomputeMentions ? UserGuildSettings.isGuildOrChannelMuted(guildId, channelId) : false;
		const member = recomputeMentions && guildId ? GuildMembers.getMember(guildId, userId) : null;
		const memberRoles = member?.roles ?? null;
		let foundAckMessage = false;
		let loadedOlderMessages = false;
		let oldestUnread: string | null = null;
		let loadedUnreadCount = 0;
		messages.forAll((message) => {
			if (!foundAckMessage) {
				foundAckMessage = message.id === this._ackMessageId;
			} else if (this._oldestUnreadMessageId == null) {
				this._oldestUnreadMessageId = message.id;
			}
			if (compareMessageIds(message.id, this._ackMessageId) > 0) {
				loadedUnreadCount++;
				if (recomputeMentions && !Relationships.isBlocked(message.author.id)) {
					const mentions = message.mentions;
					const mentionEveryone = message.mentionEveryone;
					const mentionRoles = message.mentionRoles;
					const hasUserMention = mentions?.some((m) => m.id === userId) ?? false;
					const hasEveryoneMention = !suppressEveryone && !!mentionEveryone;
					const hasRoleMention = !suppressRoles && hasMatchingRoleMention(mentionRoles, memberRoles);
					const mention = resolveReadStateMention({
						authorBlocked: false,
						hasUserMention,
						hasEveryoneMention,
						hasRoleMention,
						isPrivate,
						isMuted,
					});
					if (mention.shouldMention) {
						this.mentionCount++;
					}
				}
				oldestUnread ??= message.id;
			} else {
				loadedOlderMessages = true;
			}
		});
		const hasUnreadBoundary = foundAckMessage || loadedOlderMessages || !messages.hasMoreBefore;
		const hasPresent = messages.hasPresent();
		this.estimated = !hasPresent || !hasUnreadBoundary;
		if (this.estimated) {
			this.unreadCount = Math.max(previousUnreadCount, loadedUnreadCount);
		} else {
			this.unreadCount = loadedUnreadCount;
		}
		this.oldestUnreadMessageId = hasUnreadBoundary ? (this._oldestUnreadMessageId ?? oldestUnread) : null;
	}

	shouldMentionFor(message: MessageModel | WireMessage, userId: string, isPrivate: boolean): boolean {
		const authorBlocked = Relationships.isBlocked(message.author.id);
		const suppressEveryone = UserGuildSettings.isSuppressEveryoneEnabled(this.guildId);
		const suppressRoles = UserGuildSettings.isSuppressRolesEnabled(this.guildId);
		const mentions = message.mentions;
		const mentionEveryone = 'mentionEveryone' in message ? message.mentionEveryone : message.mention_everyone;
		const mentionRoles = 'mentionRoles' in message ? message.mentionRoles : message.mention_roles;
		const hasUserMention = mentions?.some((m) => m.id === userId) ?? false;
		const hasEveryoneMention = !suppressEveryone && !!mentionEveryone;
		const hasRoleMention = !suppressRoles && this.hasMatchingMemberRoleMention(userId, mentionRoles);
		const isMuted = UserGuildSettings.isGuildOrChannelMuted(this.guildId, this.channelId);
		return resolveReadStateMention({
			authorBlocked,
			hasUserMention,
			hasEveryoneMention,
			hasRoleMention,
			isPrivate,
			isMuted,
		}).shouldMention;
	}

	private hasMatchingMemberRoleMention(userId: string, mentionRoles?: ReadonlyArray<string> | null): boolean {
		const guildId = this.guildId;
		if (!guildId) return false;
		const member = GuildMembers.getMember(guildId, userId);
		return hasMatchingRoleMention(mentionRoles, member?.roles ?? null);
	}

	computeMentionCountAfterAck(messageId: string): number {
		const currentUser = Users.getCurrentUser();
		if (currentUser == null) {
			return 0;
		}
		const ackTimestamp = snowflakeTimestamp(messageId);
		if (ackTimestamp === 0 || Number.isNaN(ackTimestamp)) {
			return 0;
		}
		const messages = Messages.getMessages(this.channelId);
		const isPrivate = this.isPrivate;
		let mentionCount = 0;
		messages.forAll((message) => {
			if (snowflakeTimestamp(message.id) <= ackTimestamp) {
				return;
			}
			if (this.shouldMentionFor(message, currentUser.id, isPrivate)) {
				mentionCount++;
			}
		});
		return mentionCount;
	}
}

function hasMatchingRoleMention(
	mentionRoles: ReadonlyArray<string> | null | undefined,
	memberRoles: ReadonlySet<string> | null,
): boolean {
	if (memberRoles == null || mentionRoles == null || mentionRoles.length === 0) return false;
	for (const roleId of mentionRoles) {
		if (memberRoles.has(roleId)) return true;
	}
	return false;
}
