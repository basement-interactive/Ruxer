// SPDX-License-Identifier: AGPL-3.0-or-later

import MessageReactions, {type FetchStatus} from '@app/features/messaging/state/MessageReactions';
import type {ReactionEmoji} from '@app/features/messaging/utils/ReactionUtils';
import type {User} from '@app/features/user/models/User';
import type {MessageReaction} from '@fluxer/schema/src/domains/message/MessageResponseSchemas';
import {useCallback, useSyncExternalStore} from 'react';

interface ReactionUsersSnapshot {
	reactors: ReadonlyArray<User>;
	fetchStatus: FetchStatus;
	hasMore: boolean;
	initialFetchLimit: number;
}

export function useMessageReactions(messageId: string): ReadonlyArray<MessageReaction> {
	const subscribe = useCallback(
		(listener: () => void) => MessageReactions.subscribeMessage(messageId, listener),
		[messageId],
	);
	const getSnapshot = useCallback(() => MessageReactions.getMessageReactions(messageId), [messageId]);
	return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useReactionUsers(messageId: string, emoji: ReactionEmoji | null): ReactionUsersSnapshot {
	const subscribe = useCallback(
		(listener: () => void) => {
			if (!emoji) return () => {};
			return MessageReactions.subscribeReaction(messageId, emoji, listener);
		},
		[emoji, messageId],
	);
	const getSnapshot = useCallback(
		() => (emoji ? MessageReactions.getReactionVersion(messageId, emoji) : 0),
		[emoji, messageId],
	);
	useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
	return {
		reactors: emoji ? MessageReactions.getReactions(messageId, emoji) : [],
		fetchStatus: emoji ? MessageReactions.getFetchStatus(messageId, emoji) : 'idle',
		hasMore: emoji ? MessageReactions.getHasMore(messageId, emoji) : false,
		initialFetchLimit: emoji ? MessageReactions.getInitialFetchLimit(messageId, emoji) : 0,
	};
}
