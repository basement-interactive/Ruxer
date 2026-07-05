// SPDX-License-Identifier: AGPL-3.0-or-later

import Channels from '@app/features/channel/state/Channels';
import * as ReactionCommands from '@app/features/messaging/commands/ReactionCommands';
import {useMessageReactions, useReactionUsers} from '@app/features/messaging/hooks/useMessageReactionStore';
import type {Message} from '@app/features/messaging/models/MessagingMessage';
import Messages from '@app/features/messaging/state/MessagingMessages';
import {emojiEquals, getReactionKey} from '@app/features/messaging/utils/ReactionUtils';
import Permission from '@app/features/permissions/state/Permission';
import type {User} from '@app/features/user/models/User';
import {Permissions} from '@fluxer/constants/src/ChannelConstants';
import type {MessageReaction} from '@fluxer/schema/src/domains/message/MessageResponseSchemas';
import {useCallback, useEffect, useMemo, useState} from 'react';

interface UseMessageReactionsStateOptions {
	channelId: string;
	messageId: string;
	message?: Message | null;
	openToReaction?: MessageReaction | null;
	isOpen?: boolean;
	onMissingMessage?: () => void;
}

interface MessageReactionsState {
	message: Message | undefined;
	reactions: ReadonlyArray<MessageReaction>;
	selectedReaction: MessageReaction | null;
	setSelectedReaction: (reaction: MessageReaction) => void;
	reactors: ReadonlyArray<User>;
	fetchStatus: string;
	isLoading: boolean;
	hasMore: boolean;
	loadMore: () => void;
	canManageMessages: boolean;
	guildId?: string;
	reactorScrollerKey: string;
}

export function useMessageReactionsState({
	channelId,
	messageId,
	message: messageFallback,
	openToReaction,
	isOpen = true,
	onMissingMessage,
}: UseMessageReactionsStateOptions): MessageReactionsState {
	const [selectedReaction, setSelectedReaction] = useState<MessageReaction | null>(openToReaction ?? null);
	const messageFallbackMatches =
		messageFallback?.id === messageId && messageFallback.channelId === channelId ? messageFallback : undefined;
	const message = Messages.getMessage(channelId, messageId) ?? messageFallbackMatches;
	const reactions = useMessageReactions(messageId);
	const channel = Channels.getChannel(channelId);
	const guildId = channel?.guildId;
	const canManageMessages = Permission.can(Permissions.MANAGE_MESSAGES, {
		guildId,
		channelId,
	});
	useEffect(() => {
		if (openToReaction) {
			setSelectedReaction(openToReaction);
		}
	}, [openToReaction]);
	useEffect(() => {
		if (!isOpen) {
			return;
		}
		if (!message || reactions.length === 0) {
			onMissingMessage?.();
			return;
		}
		if (!selectedReaction) {
			setSelectedReaction(reactions[0]);
			return;
		}
		const exists = reactions.some((reaction) => emojiEquals(reaction.emoji, selectedReaction.emoji));
		if (!exists) {
			setSelectedReaction(reactions[0]);
		}
	}, [isOpen, message, onMissingMessage, reactions, selectedReaction]);
	const selectedReactionOnMessage =
		selectedReaction != null
			? (reactions.find((reaction) => emojiEquals(reaction.emoji, selectedReaction.emoji)) ?? selectedReaction)
			: null;
	const {reactors, fetchStatus, hasMore, initialFetchLimit} = useReactionUsers(
		messageId,
		selectedReaction?.emoji ?? null,
	);
	const isLoading = fetchStatus === 'pending';
	const reactorScrollerKey = useMemo(() => {
		if (!message || !selectedReaction) {
			return 'message-reactions-reactor-scroller';
		}
		return `message-reactions-reactor-scroller-${getReactionKey(message.id, selectedReaction.emoji)}`;
	}, [message?.id, selectedReaction]);
	useEffect(() => {
		if (!isOpen) {
			return;
		}
		if (!selectedReaction || !message) {
			return;
		}
		if (fetchStatus === 'pending') {
			return;
		}
		const reactionOnMessage = reactions.find((reaction) => emojiEquals(reaction.emoji, selectedReaction.emoji));
		if (!reactionOnMessage || reactionOnMessage.count === 0) {
			return;
		}
		const desiredInitialLimit = Math.min(100, reactionOnMessage.count);
		if (
			fetchStatus !== 'idle' &&
			(fetchStatus !== 'success' || initialFetchLimit >= desiredInitialLimit || reactors.length >= desiredInitialLimit)
		) {
			return;
		}
		ReactionCommands.getReactions(channelId, messageId, selectedReaction.emoji, {
			limit: 100,
			totalCount: reactionOnMessage.count,
		}).catch(() => {});
	}, [channelId, fetchStatus, initialFetchLimit, isOpen, message, messageId, reactors.length, selectedReaction]);
	const loadMore = useCallback(() => {
		if (!selectedReaction) return;
		ReactionCommands.loadMoreReactions(channelId, messageId, selectedReaction.emoji, {
			totalCount: selectedReactionOnMessage?.count,
		});
	}, [channelId, messageId, selectedReaction, selectedReactionOnMessage?.count]);
	return {
		message,
		reactions,
		selectedReaction,
		setSelectedReaction,
		reactors,
		fetchStatus,
		isLoading,
		hasMore,
		loadMore,
		canManageMessages,
		guildId,
		reactorScrollerKey,
	};
}
