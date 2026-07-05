// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	isEmbedsSuppressed,
	requestSpeakMessage,
	triggerAddReaction,
} from '@app/features/channel/components/MessageActionUtils';
import {MessageDebugModal} from '@app/features/devtools/components/debug/MessageDebugModal';
import {
	ADD_REACTION_DESCRIPTOR,
	BOOKMARK_MESSAGE_DESCRIPTOR,
	COPY_MESSAGE_ID_DESCRIPTOR,
	COPY_MESSAGE_LINK_DESCRIPTOR,
	COPY_TEXT_DESCRIPTOR,
	DELETE_MESSAGE_DESCRIPTOR,
	EDIT_MESSAGE_DESCRIPTOR,
	MARK_AS_UNREAD_DESCRIPTOR,
	PIN_MESSAGE_DESCRIPTOR,
	REMOVE_BOOKMARK_DESCRIPTOR,
	REPLY_DESCRIPTOR,
	SUPPRESS_EMBEDS_DESCRIPTOR,
	UNPIN_MESSAGE_DESCRIPTOR,
} from '@app/features/i18n/utils/CommonMessageDescriptors';
import type {Message} from '@app/features/messaging/models/MessagingMessage';
import SavedMessages from '@app/features/messaging/state/SavedMessages';
import {
	AddReactionIcon,
	BookmarkIcon,
	CopyIdIcon,
	CopyLinkIcon,
	CopyMessageTextIcon,
	DebugMessageIcon,
	DeleteIcon,
	EditMessageIcon,
	ForwardIcon,
	MarkAsUnreadIcon,
	PinIcon,
	RemoveAllReactionsIcon,
	ReplyIcon,
	SpeakMessageIcon,
	SuppressEmbedsIcon,
} from '@app/features/ui/action_menu/ContextMenuIcons';
import {MenuItem} from '@app/features/ui/action_menu/MenuItem';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {modal} from '@app/features/ui/commands/ModalCommands';
import {KeybindHint} from '@app/features/ui/keybind_hint/KeybindHint';
import TtsUtils from '@app/features/voice/utils/VoiceTtsUtils';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback} from 'react';

const FORWARD_DESCRIPTOR = msg({
	message: 'Forward',
	comment: 'Message action label for forwarding the selected message to another channel or DM.',
});
const UNSUPPRESS_EMBEDS_DESCRIPTOR = msg({
	message: 'Unsuppress embeds',
	comment: 'Message action that re-enables embeds on the selected message.',
});
const MESSAGE_DEBUG_DESCRIPTOR = msg({
	message: 'Message debug',
	comment: 'Title of the developer-mode message debug modal.',
});
const DEBUG_MESSAGE_DESCRIPTOR = msg({
	message: 'Debug message',
	comment: 'Developer-mode action that opens the message debug modal.',
});
const REMOVE_ALL_REACTIONS_DESCRIPTOR = msg({
	message: 'Remove all reactions',
	comment: 'Message action that removes every reaction from the selected message.',
});
const STOP_SPEAKING_DESCRIPTOR = msg({
	message: 'Stop speaking',
	comment: 'Message action that stops the screen reader from speaking the selected message.',
});
const SPEAK_MESSAGE_DESCRIPTOR = msg({
	message: 'Speak message',
	comment: 'Message action that has the screen reader read the selected message aloud.',
});

interface MessageMenuItemProps {
	message: Message;
	onClose: () => void;
}

export const AddReactionMenuItem: React.FC<MessageMenuItemProps> = observer(({message, onClose}) => {
	const {i18n} = useLingui();
	const handleAddReaction = useCallback(() => {
		triggerAddReaction(message);
		onClose();
	}, [message, onClose]);
	return (
		<MenuItem
			icon={
				<AddReactionIcon data-flx="ui.action-menu.items.message-menu-items.add-reaction-menu-item.add-reaction-icon" />
			}
			onClick={handleAddReaction}
			shortcut={
				<KeybindHint
					action="message_react"
					data-flx="ui.action-menu.items.message-menu-items.add-reaction-menu-item.keybind-hint"
				/>
			}
			data-flx="ui.action-menu.items.message-menu-items.add-reaction-menu-item.menu-item.add-reaction"
		>
			{i18n._(ADD_REACTION_DESCRIPTOR)}
		</MenuItem>
	);
});

type EditMessageMenuItemProps = MessageMenuItemProps & {
	onEdit: () => void;
};

export const EditMessageMenuItem: React.FC<EditMessageMenuItemProps> = observer(({onEdit, onClose}) => {
	const {i18n} = useLingui();
	const handleEdit = useCallback(() => {
		onEdit();
		onClose();
	}, [onEdit, onClose]);
	return (
		<MenuItem
			icon={
				<EditMessageIcon data-flx="ui.action-menu.items.message-menu-items.edit-message-menu-item.edit-message-icon" />
			}
			onClick={handleEdit}
			shortcut={
				<KeybindHint
					action="message_edit"
					data-flx="ui.action-menu.items.message-menu-items.edit-message-menu-item.keybind-hint"
				/>
			}
			data-flx="ui.action-menu.items.message-menu-items.edit-message-menu-item.menu-item.edit"
		>
			{i18n._(EDIT_MESSAGE_DESCRIPTOR)}
		</MenuItem>
	);
});

type ReplyMessageMenuItemProps = MessageMenuItemProps & {
	onReply: () => void;
};

export const ReplyMessageMenuItem: React.FC<ReplyMessageMenuItemProps> = observer(({onReply, onClose}) => {
	const {i18n} = useLingui();
	const handleReply = useCallback(() => {
		onReply();
		onClose();
	}, [onReply, onClose]);
	return (
		<MenuItem
			icon={<ReplyIcon data-flx="ui.action-menu.items.message-menu-items.reply-message-menu-item.reply-icon" />}
			onClick={handleReply}
			shortcut={
				<KeybindHint
					action="message_reply"
					data-flx="ui.action-menu.items.message-menu-items.reply-message-menu-item.keybind-hint"
				/>
			}
			data-flx="ui.action-menu.items.message-menu-items.reply-message-menu-item.menu-item.reply"
		>
			{i18n._(REPLY_DESCRIPTOR)}
		</MenuItem>
	);
});

type ForwardMessageMenuItemProps = MessageMenuItemProps & {
	onForward: () => void;
};

export const ForwardMessageMenuItem: React.FC<ForwardMessageMenuItemProps> = observer(({onForward, onClose}) => {
	const {i18n} = useLingui();
	const handleForward = useCallback(() => {
		onForward();
		onClose();
	}, [onForward, onClose]);
	return (
		<MenuItem
			icon={<ForwardIcon data-flx="ui.action-menu.items.message-menu-items.forward-message-menu-item.forward-icon" />}
			onClick={handleForward}
			shortcut={
				<KeybindHint
					action="message_forward"
					data-flx="ui.action-menu.items.message-menu-items.forward-message-menu-item.keybind-hint"
				/>
			}
			data-flx="ui.action-menu.items.message-menu-items.forward-message-menu-item.menu-item.forward"
		>
			{i18n._(FORWARD_DESCRIPTOR)}
		</MenuItem>
	);
});

type BookmarkMessageMenuItemProps = MessageMenuItemProps & {
	onSave: (isSaved: boolean) => () => void;
};

export const BookmarkMessageMenuItem: React.FC<BookmarkMessageMenuItemProps> = observer(
	({message, onSave, onClose}) => {
		const {i18n} = useLingui();
		const isSaved = SavedMessages.isSaved(message.id);
		const handleSave = useCallback(() => {
			onSave(isSaved)();
			onClose();
		}, [isSaved, onSave, onClose]);
		return (
			<MenuItem
				icon={
					<BookmarkIcon
						filled={isSaved}
						data-flx="ui.action-menu.items.message-menu-items.bookmark-message-menu-item.bookmark-icon"
					/>
				}
				onClick={handleSave}
				shortcut={
					<KeybindHint
						action="message_bookmark"
						data-flx="ui.action-menu.items.message-menu-items.bookmark-message-menu-item.keybind-hint"
					/>
				}
				data-flx="ui.action-menu.items.message-menu-items.bookmark-message-menu-item.menu-item.save"
			>
				{isSaved ? i18n._(REMOVE_BOOKMARK_DESCRIPTOR) : i18n._(BOOKMARK_MESSAGE_DESCRIPTOR)}
			</MenuItem>
		);
	},
);

type PinMessageMenuItemProps = MessageMenuItemProps & {
	onPin: () => void;
};

export const PinMessageMenuItem: React.FC<PinMessageMenuItemProps> = observer(({message, onPin, onClose}) => {
	const {i18n} = useLingui();
	const handlePin = useCallback(() => {
		onPin();
		onClose();
	}, [onPin, onClose]);
	return (
		<MenuItem
			icon={<PinIcon data-flx="ui.action-menu.items.message-menu-items.pin-message-menu-item.pin-icon" />}
			onClick={handlePin}
			shortcut={
				<KeybindHint
					action="message_pin"
					data-flx="ui.action-menu.items.message-menu-items.pin-message-menu-item.keybind-hint"
				/>
			}
			data-flx="ui.action-menu.items.message-menu-items.pin-message-menu-item.menu-item.pin"
		>
			{message.pinned ? i18n._(UNPIN_MESSAGE_DESCRIPTOR) : i18n._(PIN_MESSAGE_DESCRIPTOR)}
		</MenuItem>
	);
});

type SuppressEmbedsMenuItemProps = MessageMenuItemProps & {
	onToggleSuppressEmbeds: () => void;
};

export const SuppressEmbedsMenuItem: React.FC<SuppressEmbedsMenuItemProps> = observer(
	({message, onToggleSuppressEmbeds, onClose}) => {
		const {i18n} = useLingui();
		const handleToggle = useCallback(() => {
			onToggleSuppressEmbeds();
			onClose();
		}, [onToggleSuppressEmbeds, onClose]);
		return (
			<MenuItem
				icon={
					<SuppressEmbedsIcon data-flx="ui.action-menu.items.message-menu-items.suppress-embeds-menu-item.suppress-embeds-icon" />
				}
				onClick={handleToggle}
				shortcut={
					<KeybindHint
						action="message_toggle_embeds"
						data-flx="ui.action-menu.items.message-menu-items.suppress-embeds-menu-item.keybind-hint"
					/>
				}
				data-flx="ui.action-menu.items.message-menu-items.suppress-embeds-menu-item.menu-item.toggle"
			>
				{isEmbedsSuppressed(message) ? i18n._(UNSUPPRESS_EMBEDS_DESCRIPTOR) : i18n._(SUPPRESS_EMBEDS_DESCRIPTOR)}
			</MenuItem>
		);
	},
);

type CopyMessageTextMenuItemProps = MessageMenuItemProps & {
	onCopyMessage: () => void;
};

export const CopyMessageTextMenuItem: React.FC<CopyMessageTextMenuItemProps> = observer(({onCopyMessage, onClose}) => {
	const {i18n} = useLingui();
	const handleCopy = useCallback(() => {
		onCopyMessage();
		onClose();
	}, [onCopyMessage, onClose]);
	return (
		<MenuItem
			icon={
				<CopyMessageTextIcon data-flx="ui.action-menu.items.message-menu-items.copy-message-text-menu-item.copy-message-text-icon" />
			}
			onClick={handleCopy}
			shortcut={
				<KeybindHint
					action="message_copy_text"
					data-flx="ui.action-menu.items.message-menu-items.copy-message-text-menu-item.keybind-hint"
				/>
			}
			data-flx="ui.action-menu.items.message-menu-items.copy-message-text-menu-item.menu-item.copy"
		>
			{i18n._(COPY_TEXT_DESCRIPTOR)}
		</MenuItem>
	);
});

type CopyMessageLinkMenuItemProps = MessageMenuItemProps & {
	onCopyMessageLink: () => void;
};

export const CopyMessageLinkMenuItem: React.FC<CopyMessageLinkMenuItemProps> = observer(
	({onCopyMessageLink, onClose}) => {
		const {i18n} = useLingui();
		const handleCopyLink = useCallback(() => {
			onCopyMessageLink();
			onClose();
		}, [onCopyMessageLink, onClose]);
		return (
			<MenuItem
				icon={
					<CopyLinkIcon data-flx="ui.action-menu.items.message-menu-items.copy-message-link-menu-item.copy-link-icon" />
				}
				onClick={handleCopyLink}
				shortcut={
					<KeybindHint
						action="message_copy_link"
						data-flx="ui.action-menu.items.message-menu-items.copy-message-link-menu-item.keybind-hint"
					/>
				}
				data-flx="ui.action-menu.items.message-menu-items.copy-message-link-menu-item.menu-item.copy-link"
			>
				{i18n._(COPY_MESSAGE_LINK_DESCRIPTOR)}
			</MenuItem>
		);
	},
);

type CopyMessageIdMenuItemProps = MessageMenuItemProps & {
	onCopyMessageId: () => void;
};

export const CopyMessageIdMenuItem: React.FC<CopyMessageIdMenuItemProps> = observer(({onCopyMessageId, onClose}) => {
	const {i18n} = useLingui();
	const handleCopyId = useCallback(() => {
		onCopyMessageId();
		onClose();
	}, [onCopyMessageId, onClose]);
	return (
		<MenuItem
			icon={<CopyIdIcon data-flx="ui.action-menu.items.message-menu-items.copy-message-id-menu-item.copy-id-icon" />}
			onClick={handleCopyId}
			shortcut={
				<KeybindHint
					action="message_copy_id"
					data-flx="ui.action-menu.items.message-menu-items.copy-message-id-menu-item.keybind-hint"
				/>
			}
			data-flx="ui.action-menu.items.message-menu-items.copy-message-id-menu-item.menu-item.copy-id"
		>
			{i18n._(COPY_MESSAGE_ID_DESCRIPTOR)}
		</MenuItem>
	);
});
export const DebugMessageMenuItem: React.FC<MessageMenuItemProps> = observer(({message, onClose}) => {
	const {i18n} = useLingui();
	const handleDebug = useCallback(() => {
		ModalCommands.push(
			modal(() => (
				<MessageDebugModal
					title={i18n._(MESSAGE_DEBUG_DESCRIPTOR)}
					message={message}
					data-flx="ui.action-menu.items.message-menu-items.handle-debug.message-debug-modal"
				/>
			)),
		);
		onClose();
	}, [message, onClose]);
	return (
		<MenuItem
			icon={
				<DebugMessageIcon data-flx="ui.action-menu.items.message-menu-items.debug-message-menu-item.debug-message-icon" />
			}
			onClick={handleDebug}
			data-flx="ui.action-menu.items.message-menu-items.debug-message-menu-item.menu-item.debug"
		>
			{i18n._(DEBUG_MESSAGE_DESCRIPTOR)}
		</MenuItem>
	);
});

type DeleteMessageMenuItemProps = MessageMenuItemProps & {
	onDelete: (bypassConfirm?: boolean) => void;
};

export const DeleteMessageMenuItem: React.FC<DeleteMessageMenuItemProps> = observer(({onDelete, onClose}) => {
	const {i18n} = useLingui();
	const handleDelete = useCallback(
		(event?: unknown) => {
			const shiftKey = Boolean((event as {shiftKey?: boolean} | undefined)?.shiftKey);
			onClose();
			queueMicrotask(() => onDelete(shiftKey));
		},
		[onDelete, onClose],
	);
	return (
		<MenuItem
			icon={<DeleteIcon data-flx="ui.action-menu.items.message-menu-items.delete-message-menu-item.delete-icon" />}
			onClick={handleDelete}
			danger
			shortcut={
				<KeybindHint
					action="message_delete"
					data-flx="ui.action-menu.items.message-menu-items.delete-message-menu-item.keybind-hint"
				/>
			}
			data-flx="ui.action-menu.items.message-menu-items.delete-message-menu-item.menu-item.delete"
		>
			{i18n._(DELETE_MESSAGE_DESCRIPTOR)}
		</MenuItem>
	);
});

type RemoveAllReactionsMenuItemProps = MessageMenuItemProps & {
	onRemoveAllReactions: () => void;
};

export const RemoveAllReactionsMenuItem: React.FC<RemoveAllReactionsMenuItemProps> = observer(
	({onRemoveAllReactions, onClose}) => {
		const {i18n} = useLingui();
		const handleRemoveAll = useCallback(() => {
			onRemoveAllReactions();
			onClose();
		}, [onRemoveAllReactions, onClose]);
		return (
			<MenuItem
				icon={
					<RemoveAllReactionsIcon data-flx="ui.action-menu.items.message-menu-items.remove-all-reactions-menu-item.remove-all-reactions-icon" />
				}
				onClick={handleRemoveAll}
				danger
				data-flx="ui.action-menu.items.message-menu-items.remove-all-reactions-menu-item.menu-item.remove-all"
			>
				{i18n._(REMOVE_ALL_REACTIONS_DESCRIPTOR)}
			</MenuItem>
		);
	},
);

type MarkAsUnreadMenuItemProps = MessageMenuItemProps & {
	onMarkAsUnread: () => void;
};

export const MarkAsUnreadMenuItem: React.FC<MarkAsUnreadMenuItemProps> = observer(({onMarkAsUnread, onClose}) => {
	const {i18n} = useLingui();
	const handleMarkAsUnread = useCallback(() => {
		onMarkAsUnread();
		onClose();
	}, [onMarkAsUnread, onClose]);
	return (
		<MenuItem
			icon={
				<MarkAsUnreadIcon data-flx="ui.action-menu.items.message-menu-items.mark-as-unread-menu-item.mark-as-unread-icon" />
			}
			onClick={handleMarkAsUnread}
			shortcut={
				<KeybindHint
					action="message_mark_unread"
					data-flx="ui.action-menu.items.message-menu-items.mark-as-unread-menu-item.keybind-hint"
				/>
			}
			data-flx="ui.action-menu.items.message-menu-items.mark-as-unread-menu-item.menu-item.mark-as-unread"
		>
			{i18n._(MARK_AS_UNREAD_DESCRIPTOR)}
		</MenuItem>
	);
});
export const SpeakMessageMenuItem: React.FC<MessageMenuItemProps> = observer(({message}) => {
	const {i18n} = useLingui();
	const handleSpeakToggle = useCallback(() => {
		requestSpeakMessage(message);
	}, [message]);
	if (!TtsUtils.isSupported()) {
		return null;
	}
	if (!message.content.trim()) {
		return null;
	}
	const isSpeaking = TtsUtils.isSpeaking();
	return (
		<MenuItem
			icon={
				<SpeakMessageIcon data-flx="ui.action-menu.items.message-menu-items.speak-message-menu-item.speak-message-icon" />
			}
			onClick={handleSpeakToggle}
			shortcut={
				<KeybindHint
					action="message_speak"
					data-flx="ui.action-menu.items.message-menu-items.speak-message-menu-item.keybind-hint"
				/>
			}
			closeOnSelect={false}
			data-flx="ui.action-menu.items.message-menu-items.speak-message-menu-item.menu-item.speak-toggle"
		>
			{isSpeaking ? i18n._(STOP_SPEAKING_DESCRIPTOR) : i18n._(SPEAK_MESSAGE_DESCRIPTOR)}
		</MenuItem>
	);
});
