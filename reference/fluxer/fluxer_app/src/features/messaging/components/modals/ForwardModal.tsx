// SPDX-License-Identifier: AGPL-3.0-or-later

import * as Modal from '@app/features/app/components/dialogs/Modal';
import {
	getChannelSlowmodeState,
	getForwardChannelCategoryName,
	getForwardChannelDisplayName,
	getForwardChannelGuildName,
	useForwardChannelSelection,
} from '@app/features/app/components/dialogs/shared/ForwardChannelSelection';
import selectorStyles from '@app/features/app/components/dialogs/shared/SelectorModalStyles.module.css';
import {GroupDMAvatar} from '@app/features/app/components/shared/GroupDMAvatar';
import {Limits} from '@app/features/app/utils/UserLimits';
import {Autocomplete, getAutocompleteOptionId} from '@app/features/channel/components/Autocomplete';
import {MessageCharacterCounter} from '@app/features/channel/components/MessageCharacterCounter';
import type {Channel} from '@app/features/channel/models/Channel';
import Channels from '@app/features/channel/state/Channels';
import {ExpressionPickerSheet} from '@app/features/expressions/components/modals/ExpressionPickerSheet';
import {ExpressionPickerPopout} from '@app/features/expressions/components/popouts/ExpressionPickerPopout';
import * as MessageCommands from '@app/features/messaging/commands/MessageCommands';
import {MessageForwardFailedModal} from '@app/features/messaging/components/alerts/MessageForwardFailedModal';
import {showMessagingErrorModal} from '@app/features/messaging/components/alerts/MessagingErrorModalUtils';
import modalStyles from '@app/features/messaging/components/modals/ForwardModal.module.css';
import {shouldNavigateAfterForward} from '@app/features/messaging/components/modals/ForwardModalUtils';
import {useTextareaAutocomplete} from '@app/features/messaging/hooks/useTextareaAutocomplete';
import {useTextareaEmojiPicker} from '@app/features/messaging/hooks/useTextareaEmojiPicker';
import {useTextareaPaste} from '@app/features/messaging/hooks/useTextareaPaste';
import {useTextareaSegments} from '@app/features/messaging/hooks/useTextareaSegments';
import type {Message} from '@app/features/messaging/models/MessagingMessage';
import {focusChannelTextareaAfterNavigation} from '@app/features/messaging/utils/ChannelTextareaFocusUtils';
import {isIMEComposing} from '@app/features/messaging/utils/IMECompositionUtils';
import * as NavigationCommands from '@app/features/navigation/commands/NavigationCommands';
import {Logger} from '@app/features/platform/utils/AppLogger';
import {TextareaAutosize} from '@app/features/platform/utils/AutoResizingTextarea';
import {Button} from '@app/features/ui/button/Button';
import {Checkbox} from '@app/features/ui/checkbox/Checkbox';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {modal} from '@app/features/ui/commands/ModalCommands';
import * as ToastCommands from '@app/features/ui/commands/ToastCommands';
import {Input} from '@app/features/ui/components/form/FormInput';
import {Scroller} from '@app/features/ui/components/Scroller';
import {StatusAwareAvatar} from '@app/features/ui/components/StatusAwareAvatar';
import FocusRing from '@app/features/ui/focus_ring/FocusRing';
import {Popout} from '@app/features/ui/popover/PopoverPopout';
import MobileLayout from '@app/features/ui/state/MobileLayout';
import type {User} from '@app/features/user/models/User';
import Users from '@app/features/user/state/Users';
import {ChannelTypes} from '@fluxer/constants/src/ChannelConstants';
import {MAX_MESSAGE_LENGTH_PREMIUM} from '@fluxer/constants/src/LimitConstants';
import {msg} from '@lingui/core/macro';
import {Trans, useLingui} from '@lingui/react/macro';
import {HashIcon, MagnifyingGlassIcon, NotePencilIcon, SmileyIcon, SpeakerHighIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import {type MouseEvent, useCallback, useId, useMemo, useRef, useState} from 'react';

const MESSAGE_IS_TOO_LONG_DESCRIPTOR = msg({
	message: 'Message is too long',
	comment: 'Error modal title in the forward modal when the optional comment exceeds the message length limit.',
});
const SHORTEN_THE_MESSAGE_AND_TRY_AGAIN_DESCRIPTOR = msg({
	message: 'Shorten the message and try again.',
	comment: 'Body of the error modal shown when the forward modal comment exceeds the message length limit.',
});
const COMMENTS_ARE_DISABLED_BECAUSE_SLOWMODE_IS_ON_IN_DESCRIPTOR = msg({
	message:
		'Comments are disabled because slowmode is on in {forwardChannelDisplayName}. The comment would be blocked by slowmode right after the forward.',
	comment:
		'Helper text in the forward modal explaining why the optional comment field is disabled for a single selected channel with slowmode.',
});
const COMMENTS_ARE_DISABLED_BECAUSE_ONE_OR_MORE_SELECTED_DESCRIPTOR = msg({
	message:
		'Comments are disabled because one or more selected channels have slowmode on. The comment would be blocked by slowmode right after the forward.',
	comment:
		'Helper text in the forward modal explaining why the optional comment field is disabled when at least one selected target has slowmode active.',
});
const WAITING_FOR_SLOWMODE_IN_TO_EXPIRE_DESCRIPTOR = msg({
	message: 'Waiting for slowmode in {forwardChannelDisplayName} to expire.',
	comment:
		'Inline notice in the forward modal when slowmode is active in the selected target channel. forwardChannelDisplayName is the channel name.',
});
const WAITING_FOR_SLOWMODE_IN_ONE_OR_MORE_SELECTED_DESCRIPTOR = msg({
	message: 'Waiting for slowmode in one or more selected channels to expire.',
	comment: 'Inline notice in the forward modal when slowmode is active in one or more selected target channels.',
});
const FORWARD_MESSAGE_DESCRIPTOR = msg({
	message: 'Forward message',
	comment: 'Title of the forward message modal.',
});
const SEARCH_CHANNELS_OR_DMS_DESCRIPTOR = msg({
	message: 'Search channels or DMs',
	comment: 'Placeholder text in the channel picker search input of the forward modal.',
});
const COMMENTS_ARE_UNAVAILABLE_WHILE_SLOWMODE_IS_ON_DESCRIPTOR = msg({
	message: 'Comments are unavailable while slowmode is on.',
	comment: 'Tooltip on the disabled comment field in the forward modal when slowmode blocks comments.',
});
const ADD_A_COMMENT_OPTIONAL_DESCRIPTOR = msg({
	message: 'Add a comment (optional)',
	comment: 'Placeholder text in the optional comment field of the forward modal.',
});
const OPEN_EMOJI_PICKER_DESCRIPTOR = msg({
	message: 'Open emoji picker',
	comment: 'Accessible label for the emoji picker trigger button in the forward modal comment field.',
});
const SEND_SELECTED_COUNT_DESCRIPTOR = msg({
	message: 'Send ({selectedCount}/{selectionLimit})',
	comment:
		'Primary button label in the forward message modal. selectedCount is the number of selected destinations; selectionLimit is the maximum allowed.',
});
const logger = new Logger('ForwardModal');

interface ForwardModalProps {
	message: Message;
	mediaSelection?: MessageCommands.ForwardMediaSelection;
	onForwardSuccess?: (result: ForwardModalSuccess) => void;
	sourceChannel?: Channel | null;
	user: User;
}

export interface ForwardModalSuccess {
	forwardedChannelIds: ReadonlyArray<string>;
	shouldNavigate: boolean;
}

export const ForwardModal = observer(
	({message, mediaSelection, onForwardSuccess, sourceChannel, user}: ForwardModalProps) => {
		const {i18n} = useLingui();
		const mediaSelectionCapability = useMemo(
			() =>
				mediaSelection
					? {
							hasAttachments: Boolean(mediaSelection.attachmentIds?.length),
							hasEmbeds: Boolean(mediaSelection.embedIndices?.length),
						}
					: undefined,
			[mediaSelection],
		);
		const {
			filteredChannels,
			handleToggleChannel,
			isChannelDisabled,
			getChannelDisableReason,
			searchQuery,
			selectedChannelIds,
			setSearchQuery,
			maxSelections,
			selectedChannels,
			slowmodeEnabledSelectedChannels,
		} = useForwardChannelSelection({
			excludedChannelId: message.channelId,
			message,
			mediaSelection: mediaSelectionCapability,
		});
		const [optionalMessage, setOptionalMessage] = useState('');
		const [isForwarding, setIsForwarding] = useState(false);
		const [expressionPickerOpen, setExpressionPickerOpen] = useState(false);
		const autocompleteListId = useId();
		const textareaRef = useRef<HTMLTextAreaElement>(null);
		const containerRef = useRef<HTMLDivElement>(null);
		const premiumMaxLength = Limits.getPremiumValue('max_message_length', MAX_MESSAGE_LENGTH_PREMIUM);
		const mobileLayout = MobileLayout;
		const {segmentManagerRef, previousValueRef, displayToActual, prepareTextChange, handleTextChange} =
			useTextareaSegments();
		const handleOptionalMessageExceedsLimit = useCallback(() => {
			showMessagingErrorModal({
				title: i18n._(MESSAGE_IS_TOO_LONG_DESCRIPTOR),
				message: i18n._(SHORTEN_THE_MESSAGE_AND_TRY_AGAIN_DESCRIPTOR),
				dataFlx: 'messaging.forward-modal.optional-message-too-long.generic-error-modal',
			});
		}, [i18n]);
		const {handleEmojiSelect} = useTextareaEmojiPicker({
			setValue: setOptionalMessage,
			textareaRef,
			segmentManagerRef,
			previousValueRef,
			prepareTextChange,
			maxActualLength: user.maxMessageLength,
			onExceedMaxLength: handleOptionalMessageExceedsLimit,
		});
		const channel = sourceChannel ?? Channels.getChannel(message.channelId) ?? null;
		const {
			autocompleteQuery,
			autocompleteOptions,
			autocompleteType,
			selectedIndex,
			isAutocompleteAttached,
			setSelectedIndex,
			onCursorMove,
			handleSelect,
		} = useTextareaAutocomplete({
			channel,
			value: optionalMessage,
			setValue: setOptionalMessage,
			textareaRef,
			segmentManagerRef,
			previousValueRef,
			prepareTextChange,
			maxActualLength: user.maxMessageLength,
			onExceedMaxLength: handleOptionalMessageExceedsLimit,
		});
		useTextareaPaste({
			channel,
			textareaRef,
			segmentManagerRef,
			setValue: setOptionalMessage,
			previousValueRef,
			prepareTextChange,
			maxMessageLength: user.maxMessageLength,
			onPasteExceedsLimit: () => handleOptionalMessageExceedsLimit(),
		});
		const actualOptionalMessage = useMemo(() => displayToActual(optionalMessage), [displayToActual, optionalMessage]);
		const optionalMessageDisplayMaxLength = useMemo(() => {
			return Math.max(0, optionalMessage.length + (user.maxMessageLength - actualOptionalMessage.length));
		}, [actualOptionalMessage.length, user.maxMessageLength, optionalMessage.length]);
		const slowmodeCoolingDownSelectedChannels = selectedChannels.filter(
			(selectedChannel) => getChannelSlowmodeState(selectedChannel).isCoolingDown,
		);
		const isSendBlockedBySlowmode = slowmodeCoolingDownSelectedChannels.length > 0;
		const isCommentBlockedBySlowmode = slowmodeEnabledSelectedChannels.length > 0;
		const isCommentComposerDisabled = isCommentBlockedBySlowmode;
		const activeAutocompleteOptionId =
			isAutocompleteAttached && autocompleteOptions[selectedIndex]
				? getAutocompleteOptionId(autocompleteListId, selectedIndex)
				: undefined;
		const commentBlockedNotice = useMemo(() => {
			if (!isCommentBlockedBySlowmode) {
				return null;
			}
			if (slowmodeEnabledSelectedChannels.length === 1) {
				return i18n._(COMMENTS_ARE_DISABLED_BECAUSE_SLOWMODE_IS_ON_IN_DESCRIPTOR, {
					forwardChannelDisplayName: getForwardChannelDisplayName(slowmodeEnabledSelectedChannels[0], i18n),
				});
			}
			return i18n._(COMMENTS_ARE_DISABLED_BECAUSE_ONE_OR_MORE_SELECTED_DESCRIPTOR);
		}, [i18n.locale, isCommentBlockedBySlowmode, slowmodeEnabledSelectedChannels]);
		const sendBlockedNotice = useMemo(() => {
			if (!isSendBlockedBySlowmode) return null;
			if (slowmodeCoolingDownSelectedChannels.length === 1) {
				return i18n._(WAITING_FOR_SLOWMODE_IN_TO_EXPIRE_DESCRIPTOR, {
					forwardChannelDisplayName: getForwardChannelDisplayName(slowmodeCoolingDownSelectedChannels[0], i18n),
				});
			}
			return i18n._(WAITING_FOR_SLOWMODE_IN_ONE_OR_MORE_SELECTED_DESCRIPTOR);
		}, [i18n.locale, isSendBlockedBySlowmode, slowmodeCoolingDownSelectedChannels]);
		const handleForward = async (skipNavigation = false) => {
			if (selectedChannelIds.size === 0 || isForwarding || isSendBlockedBySlowmode) return;
			setIsForwarding(true);
			try {
				const actualMessage = !isCommentComposerDisabled && optionalMessage.trim() ? actualOptionalMessage : undefined;
				const forwardedChannelIds = Array.from(selectedChannelIds);
				const forwarded = await MessageCommands.forward(
					forwardedChannelIds,
					{
						message_id: message.id,
						channel_id: message.channelId,
						guild_id: channel?.guildId ?? message.guildId ?? null,
						attachment_ids: mediaSelection?.attachmentIds,
						embed_indices: mediaSelection?.embedIndices,
					},
					actualMessage,
				);
				if (!forwarded) {
					return;
				}
				ToastCommands.createToast({
					type: 'success',
					children: <Trans>Message forwarded</Trans>,
				});
				ModalCommands.pop();
				const shouldNavigate = shouldNavigateAfterForward(skipNavigation, forwardedChannelIds.length);
				onForwardSuccess?.({forwardedChannelIds, shouldNavigate});
				if (shouldNavigate) {
					const forwardedChannelId = forwardedChannelIds[0];
					const forwardedChannel = Channels.getChannel(forwardedChannelId);
					if (forwardedChannel) {
						NavigationCommands.selectChannel(forwardedChannel.guildId ?? undefined, forwardedChannelId);
						focusChannelTextareaAfterNavigation(forwardedChannelId);
					}
				}
			} catch (error) {
				logger.error('Failed to forward message:', error);
				ModalCommands.push(
					modal(() => (
						<MessageForwardFailedModal data-flx="messaging.forward-modal.handle-forward.message-forward-failed-modal" />
					)),
				);
			} finally {
				setIsForwarding(false);
			}
		};
		const getChannelIcon = (ch: Channel) => {
			const iconSize = 32;
			if (ch.type === ChannelTypes.DM_PERSONAL_NOTES) {
				return (
					<NotePencilIcon
						className={selectorStyles.itemIcon}
						weight="fill"
						size={iconSize}
						data-flx="messaging.forward-modal.get-channel-icon.note-pencil-icon"
					/>
				);
			}
			if (ch.type === ChannelTypes.DM) {
				const recipientId = ch.recipientIds[0];
				const user = Users.getUser(recipientId);
				if (!user) return null;
				return (
					<div className={selectorStyles.avatar} data-flx="messaging.forward-modal.get-channel-icon.div">
						<StatusAwareAvatar
							user={user}
							size={iconSize}
							data-flx="messaging.forward-modal.get-channel-icon.status-aware-avatar"
						/>
					</div>
				);
			}
			if (ch.type === ChannelTypes.GROUP_DM) {
				return (
					<div className={selectorStyles.avatar} data-flx="messaging.forward-modal.get-channel-icon.div--2">
						<GroupDMAvatar
							channel={ch}
							size={iconSize}
							data-flx="messaging.forward-modal.get-channel-icon.group-dm-avatar"
						/>
					</div>
				);
			}
			if (ch.type === ChannelTypes.GUILD_VOICE) {
				return (
					<SpeakerHighIcon
						className={selectorStyles.itemIcon}
						weight="fill"
						size={iconSize}
						data-flx="messaging.forward-modal.get-channel-icon.speaker-high-icon"
					/>
				);
			}
			return (
				<HashIcon
					className={selectorStyles.itemIcon}
					weight="bold"
					size={iconSize}
					data-flx="messaging.forward-modal.get-channel-icon.hash-icon"
				/>
			);
		};
		return (
			<Modal.Root size="small" centered data-flx="messaging.forward-modal.modal-root">
				<Modal.Header title={i18n._(FORWARD_MESSAGE_DESCRIPTOR)} data-flx="messaging.forward-modal.modal-header">
					<div className={selectorStyles.headerSearch} data-flx="messaging.forward-modal.div">
						<Input
							type="text"
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							placeholder={i18n._(SEARCH_CHANNELS_OR_DMS_DESCRIPTOR)}
							maxLength={100}
							leftIcon={
								<MagnifyingGlassIcon
									className={selectorStyles.searchIcon}
									weight="bold"
									data-flx="messaging.forward-modal.magnifying-glass-icon"
								/>
							}
							className={selectorStyles.headerSearchInput}
							data-flx="messaging.forward-modal.input.set-search-query.text"
						/>
					</div>
				</Modal.Header>
				<Modal.Content className={selectorStyles.selectorContent} data-flx="messaging.forward-modal.modal-content">
					<div className={selectorStyles.listContainer} data-flx="messaging.forward-modal.div--2">
						<Scroller
							className={selectorStyles.scroller}
							key="forward-modal-channel-list-scroller"
							fade={false}
							data-flx="messaging.forward-modal.scroller"
						>
							{filteredChannels.length === 0 ? (
								<div className={selectorStyles.emptyState} data-flx="messaging.forward-modal.div--3">
									<Trans>No channels found</Trans>
								</div>
							) : (
								<div className={selectorStyles.itemList} data-flx="messaging.forward-modal.div--4">
									{filteredChannels.map((ch: Channel | null) => {
										if (!ch) return null;
										const isSelected = selectedChannelIds.has(ch.id);
										const isDisabledForSelection = isChannelDisabled(ch.id);
										const isDisabled = isDisabledForSelection && !isSelected;
										const disableReason = getChannelDisableReason(ch);
										const displayName = getForwardChannelDisplayName(ch);
										const categoryName = getForwardChannelCategoryName(ch);
										const guildName = getForwardChannelGuildName(ch);
										return (
											<FocusRing
												key={ch.id}
												offset={-2}
												enabled={!isDisabled}
												data-flx="messaging.forward-modal.focus-ring"
											>
												<button
													type="button"
													onClick={() => !isDisabled && handleToggleChannel(ch.id)}
													disabled={isDisabled}
													aria-pressed={isSelected}
													className={clsx(
														selectorStyles.itemButton,
														isSelected && selectorStyles.itemButtonSelected,
														isDisabled && selectorStyles.itemButtonDisabled,
													)}
													data-flx="messaging.forward-modal.button"
												>
													<div className={selectorStyles.itemContent} data-flx="messaging.forward-modal.div--5">
														{getChannelIcon(ch)}
														<div className={selectorStyles.itemInfo} data-flx="messaging.forward-modal.div--6">
															<span className={selectorStyles.itemName} data-flx="messaging.forward-modal.span">
																{displayName}
															</span>
															{disableReason ? (
																<span
																	className={selectorStyles.itemSecondary}
																	data-flx="messaging.forward-modal.span--2"
																>
																	{disableReason}
																</span>
															) : (
																(guildName || categoryName) && (
																	<span
																		className={selectorStyles.itemSecondary}
																		data-flx="messaging.forward-modal.span--3"
																	>
																		{[guildName, categoryName].filter(Boolean).join(' • ')}
																	</span>
																)
															)}
														</div>
													</div>
													<div className={selectorStyles.itemAction} data-flx="messaging.forward-modal.div--7">
														<Checkbox
															checked={isSelected}
															disabled={isDisabled}
															aria-hidden={true}
															data-flx="messaging.forward-modal.checkbox"
														/>
													</div>
												</button>
											</FocusRing>
										);
									})}
								</div>
							)}
						</Scroller>
					</div>
				</Modal.Content>
				<div className={modalStyles.inputAreaContainer} data-flx="messaging.forward-modal.div--8">
					{isAutocompleteAttached && (
						<Autocomplete
							type={autocompleteType}
							onSelect={handleSelect}
							selectedIndex={selectedIndex}
							options={autocompleteOptions}
							setSelectedIndex={setSelectedIndex}
							referenceElement={containerRef.current}
							zIndex={20000}
							query={autocompleteQuery}
							listboxId={autocompleteListId}
							data-flx="messaging.forward-modal.autocomplete.select"
						/>
					)}
					<div
						ref={containerRef}
						className={modalStyles.messageInputContainer}
						data-flx="messaging.forward-modal.div--9"
					>
						<TextareaAutosize
							className={clsx(modalStyles.messageInput, modalStyles.messageInputBase)}
							maxLength={optionalMessageDisplayMaxLength}
							ref={textareaRef}
							value={optionalMessage}
							disabled={isCommentComposerDisabled}
							onChange={(e) => {
								const newValue = e.target.value;
								const nativeEvent = e.nativeEvent as InputEvent;
								handleTextChange(
									newValue,
									previousValueRef.current,
									typeof nativeEvent.inputType === 'string' ? nativeEvent.inputType : undefined,
								);
								setOptionalMessage(newValue);
							}}
							onKeyDown={(e) => {
								onCursorMove();
								if (isIMEComposing(e)) {
									return;
								}
								if (isAutocompleteAttached) {
									if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
										e.preventDefault();
										setSelectedIndex((prevIndex) => {
											const newIndex = e.key === 'ArrowUp' ? prevIndex - 1 : prevIndex + 1;
											return (newIndex + autocompleteOptions.length) % autocompleteOptions.length;
										});
									} else if ((e.key === 'Tab' || e.key === 'Enter') && !e.shiftKey) {
										e.preventDefault();
										const selectedOption = autocompleteOptions[selectedIndex];
										if (selectedOption) {
											handleSelect(selectedOption);
										}
									}
								}
							}}
							placeholder={
								isCommentComposerDisabled
									? i18n._(COMMENTS_ARE_UNAVAILABLE_WHILE_SLOWMODE_IS_ON_DESCRIPTOR)
									: i18n._(ADD_A_COMMENT_OPTIONAL_DESCRIPTOR)
							}
							aria-autocomplete="list"
							aria-controls={isAutocompleteAttached ? autocompleteListId : undefined}
							aria-expanded={isAutocompleteAttached}
							aria-haspopup="listbox"
							aria-activedescendant={activeAutocompleteOptionId}
							data-flx="messaging.forward-modal.textarea-autosize.text-change"
						/>
						<MessageCharacterCounter
							currentLength={actualOptionalMessage.length}
							maxLength={user.maxMessageLength}
							canUpgrade={user.maxMessageLength < premiumMaxLength}
							premiumMaxLength={premiumMaxLength}
							data-flx="messaging.forward-modal.message-character-counter"
						/>
						{commentBlockedNotice && (
							<div className={modalStyles.slowmodeNotice} data-flx="messaging.forward-modal.div--10">
								{commentBlockedNotice}
							</div>
						)}
						{sendBlockedNotice && !commentBlockedNotice && (
							<div className={modalStyles.slowmodeNotice} data-flx="messaging.forward-modal.div--11">
								{sendBlockedNotice}
							</div>
						)}
						<div className={modalStyles.messageInputActions} data-flx="messaging.forward-modal.div--12">
							{mobileLayout.enabled ? (
								<FocusRing offset={-2} data-flx="messaging.forward-modal.focus-ring--2">
									<button
										type="button"
										onClick={() => setExpressionPickerOpen(true)}
										disabled={isCommentBlockedBySlowmode}
										className={clsx(
											modalStyles.emojiPickerButton,
											expressionPickerOpen && modalStyles.emojiPickerButtonActive,
										)}
										aria-label={i18n._(OPEN_EMOJI_PICKER_DESCRIPTOR)}
										aria-haspopup="dialog"
										aria-expanded={expressionPickerOpen}
										data-flx="messaging.forward-modal.button.set-expression-picker-open"
									>
										<SmileyIcon
											className={modalStyles.emojiIcon}
											weight="fill"
											data-flx="messaging.forward-modal.smiley-icon"
										/>
									</button>
								</FocusRing>
							) : (
								<Popout
									position="top-end"
									animationType="none"
									offsetMainAxis={8}
									offsetCrossAxis={0}
									onOpen={() => setExpressionPickerOpen(true)}
									onClose={() => setExpressionPickerOpen(false)}
									returnFocusRef={textareaRef}
									render={({onClose}) => (
										<ExpressionPickerPopout
											channelId={message.channelId}
											onEmojiSelect={(emoji, shiftKey) => {
												const didInsert = handleEmojiSelect(emoji, shiftKey);
												if (didInsert && !shiftKey) {
													onClose();
												}
											}}
											onClose={onClose}
											visibleTabs={['emojis']}
											data-flx="messaging.forward-modal.expression-picker-popout"
										/>
									)}
									data-flx="messaging.forward-modal.popout"
								>
									<FocusRing offset={-2} data-flx="messaging.forward-modal.focus-ring--3">
										<button
											type="button"
											disabled={isCommentBlockedBySlowmode}
											className={clsx(
												modalStyles.emojiPickerButton,
												expressionPickerOpen && modalStyles.emojiPickerButtonActive,
											)}
											aria-label={i18n._(OPEN_EMOJI_PICKER_DESCRIPTOR)}
											aria-haspopup="dialog"
											aria-expanded={expressionPickerOpen}
											data-flx="messaging.forward-modal.button--2"
										>
											<SmileyIcon
												className={modalStyles.emojiIcon}
												weight="fill"
												data-flx="messaging.forward-modal.smiley-icon--2"
											/>
										</button>
									</FocusRing>
								</Popout>
							)}
						</div>
					</div>
				</div>
				<Modal.Footer data-flx="messaging.forward-modal.modal-footer">
					<Button variant="secondary" onClick={() => ModalCommands.pop()} data-flx="messaging.forward-modal.button.pop">
						<Trans>Cancel</Trans>
					</Button>
					<Button
						onClick={(event: MouseEvent<HTMLButtonElement>) => handleForward(event.shiftKey)}
						disabled={selectedChannelIds.size === 0 || isForwarding || isSendBlockedBySlowmode}
						data-flx="messaging.forward-modal.button.forward"
					>
						{i18n._(SEND_SELECTED_COUNT_DESCRIPTOR, {
							selectedCount: selectedChannelIds.size,
							selectionLimit: maxSelections,
						})}
					</Button>
				</Modal.Footer>
				{mobileLayout.enabled && (
					<ExpressionPickerSheet
						isOpen={expressionPickerOpen}
						onClose={() => setExpressionPickerOpen(false)}
						channelId={message.channelId}
						onEmojiSelect={(emoji, shiftKey) => {
							const didInsert = handleEmojiSelect(emoji, shiftKey);
							if (didInsert && !shiftKey) {
								setExpressionPickerOpen(false);
							}
							return didInsert;
						}}
						visibleTabs={['emojis']}
						selectedTab="emojis"
						zIndex={30000}
						data-flx="messaging.forward-modal.expression-picker-sheet"
					/>
				)}
			</Modal.Root>
		);
	},
);
