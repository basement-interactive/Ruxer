// SPDX-License-Identifier: AGPL-3.0-or-later

import * as Modal from '@app/features/app/components/dialogs/Modal';
import {
	MessageReactionsFilters,
	MessageReactionsReactorsList,
} from '@app/features/app/components/shared/MessageReactionsContent';
import Authentication from '@app/features/auth/state/Authentication';
import Emoji from '@app/features/emoji/state/Emoji';
import type {FlatEmoji} from '@app/features/emoji/types/EmojiTypes';
import * as ReactionCommands from '@app/features/messaging/commands/ReactionCommands';
import styles from '@app/features/messaging/components/modals/MessageReactionsModal.module.css';
import {useMessageReactionsState} from '@app/features/messaging/hooks/useMessageReactionsState';
import type {Message} from '@app/features/messaging/models/MessagingMessage';
import {EmojiContextMenuItems} from '@app/features/ui/action_menu/items/EmojiContextMenuItems';
import {MenuGroup} from '@app/features/ui/action_menu/MenuGroup';
import {MenuItem} from '@app/features/ui/action_menu/MenuItem';
import * as ContextMenuCommands from '@app/features/ui/commands/ContextMenuCommands';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import type {User} from '@app/features/user/models/User';
import type {MessageReaction} from '@fluxer/schema/src/domains/message/MessageResponseSchemas';
import {msg} from '@lingui/core/macro';
import {Trans, useLingui} from '@lingui/react/macro';
import {TrashIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import {type MouseEvent, useCallback} from 'react';

const REMOVE_REACTION_DESCRIPTOR = msg({
	message: 'Remove reaction',
	comment:
		'Button or menu action label in the message reactions modal. Keep it concise. Keep the tone plain and specific.',
});
const LOADING_REACTIONS_DESCRIPTOR = msg({
	message: 'Loading reactions',
	comment: 'Short label in the message reactions modal. Keep it concise.',
});
export const MessageReactionsModal = observer(
	({
		channelId,
		messageId,
		message: messageFallback,
		openToReaction,
	}: {
		channelId: string;
		messageId: string;
		message?: Message | null;
		openToReaction: MessageReaction;
	}) => {
		const {i18n} = useLingui();
		const {
			message,
			reactions,
			selectedReaction,
			setSelectedReaction,
			reactors,
			isLoading,
			hasMore,
			loadMore,
			canManageMessages,
			guildId,
			reactorScrollerKey,
		} = useMessageReactionsState({
			channelId,
			messageId,
			message: messageFallback,
			openToReaction,
			isOpen: true,
			onMissingMessage: () => ModalCommands.pop(),
		});
		const handleReactionContextMenu = useCallback(
			(reaction: MessageReaction, event: MouseEvent<HTMLButtonElement>) => {
				const emojiId = reaction.emoji.id;
				if (!emojiId && !canManageMessages) {
					return;
				}
				event.preventDefault();
				event.stopPropagation();
				const emojiForMenu: FlatEmoji | null = emojiId
					? (Emoji.getEmojiById(emojiId) ?? {
							id: emojiId,
							name: reaction.emoji.name,
							uniqueName: reaction.emoji.name,
							allNamesString: `:${reaction.emoji.name}:`,
							animated: Boolean(reaction.emoji.animated),
						})
					: null;
				ContextMenuCommands.openFromEvent(event, ({onClose}) => (
					<>
						{emojiForMenu && (
							<EmojiContextMenuItems
								emoji={emojiForMenu}
								onClose={onClose}
								data-flx="messaging.message-reactions-modal.handle-reaction-context-menu.emoji-context-menu-items"
							/>
						)}
						{canManageMessages && (
							<MenuGroup data-flx="messaging.message-reactions-modal.handle-reaction-context-menu.menu-group">
								<MenuItem
									icon={
										<TrashIcon data-flx="messaging.message-reactions-modal.handle-reaction-context-menu.trash-icon" />
									}
									onClick={() => {
										ReactionCommands.removeReactionEmoji(i18n, channelId, messageId, reaction.emoji);
										onClose();
									}}
									danger
									data-flx="messaging.message-reactions-modal.handle-reaction-context-menu.menu-item.remove-reaction-emoji"
								>
									{i18n._(REMOVE_REACTION_DESCRIPTOR)}
								</MenuItem>
							</MenuGroup>
						)}
					</>
				));
			},
			[canManageMessages, channelId, i18n, messageId],
		);
		const handleRemoveReactor = useCallback(
			(reactor: User) => {
				if (!selectedReaction) {
					return;
				}
				const isOwnReaction = Authentication.currentUserId != null && reactor.id === Authentication.currentUserId;
				ReactionCommands.removeReaction(
					i18n,
					channelId,
					messageId,
					selectedReaction.emoji,
					isOwnReaction ? undefined : reactor.id,
				);
			},
			[channelId, i18n, messageId, selectedReaction],
		);
		if (!message || !selectedReaction) {
			return null;
		}
		return (
			<Modal.Root
				size="medium"
				className={styles.modalRoot}
				onClose={() => ModalCommands.pop()}
				data-flx="messaging.message-reactions-modal.modal-root"
			>
				<Modal.Header title={<Trans>Reactions</Trans>} data-flx="messaging.message-reactions-modal.modal-header" />
				<Modal.Content
					className={styles.modalContent}
					padding="none"
					overflow="hidden"
					showTrack={false}
					data-flx="messaging.message-reactions-modal.modal-content"
				>
					<div className={styles.modalLayout} data-flx="messaging.message-reactions-modal.modal-layout">
						<div className={styles.sidebar} data-flx="messaging.message-reactions-modal.sidebar">
							<div
								className={styles.reactionFiltersPane}
								data-flx="messaging.message-reactions-modal.reaction-filters-pane"
							>
								<MessageReactionsFilters
									messageId={messageId}
									reactions={reactions}
									selectedReaction={selectedReaction}
									onSelectReaction={setSelectedReaction}
									canManageMessages={canManageMessages}
									variant="modal"
									onReactionContextMenu={handleReactionContextMenu}
									data-flx="messaging.message-reactions-modal.message-reactions-filters"
								/>
							</div>
						</div>
						<div
							className={styles.reactionListContainer}
							data-flx="messaging.message-reactions-modal.reaction-list-container"
						>
							<MessageReactionsReactorsList
								channelId={channelId}
								reactors={reactors}
								isLoading={isLoading}
								hasMore={hasMore}
								onLoadMore={loadMore}
								canManageMessages={canManageMessages}
								currentUserId={Authentication.currentUserId}
								guildId={guildId}
								scrollerKey={reactorScrollerKey}
								loadingLabel={i18n._(LOADING_REACTIONS_DESCRIPTOR)}
								onRemoveReactor={handleRemoveReactor}
								data-flx="messaging.message-reactions-modal.message-reactions-reactors-list"
							/>
						</div>
					</div>
				</Modal.Content>
			</Modal.Root>
		);
	},
);
