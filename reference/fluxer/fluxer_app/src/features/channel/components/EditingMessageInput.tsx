// SPDX-License-Identifier: AGPL-3.0-or-later

import {Limits} from '@app/features/app/utils/UserLimits';
import {Autocomplete} from '@app/features/channel/components/Autocomplete';
import editingStyles from '@app/features/channel/components/EditingMessageInput.module.css';
import {MessageCharacterCounter} from '@app/features/channel/components/MessageCharacterCounter';
import wrapperStyles from '@app/features/channel/components/textarea/InputWrapper.module.css';
import {TextareaButton} from '@app/features/channel/components/textarea/TextareaButton';
import styles from '@app/features/channel/components/textarea/TextareaInput.module.css';
import {TextareaInputField} from '@app/features/channel/components/textarea/TextareaInputField';
import type {Channel} from '@app/features/channel/models/Channel';
import {ExpressionPickerSheet} from '@app/features/expressions/components/modals/ExpressionPickerSheet';
import {ExpressionPickerPopout} from '@app/features/expressions/components/popouts/ExpressionPickerPopout';
import GuildVerification, {VerificationFailureReason} from '@app/features/guild/state/GuildVerification';
import {
	CANNOT_SEND_MESSAGES_IN_CHANNEL_DESCRIPTOR,
	EMOJIS_DESCRIPTOR,
} from '@app/features/i18n/utils/CommonMessageDescriptors';
import {useMarkdownFormattingShortcut, useMarkdownKeybinds} from '@app/features/messaging/hooks/useMarkdownKeybinds';
import {useTextareaAutocomplete} from '@app/features/messaging/hooks/useTextareaAutocomplete';
import {useTextareaEmojiPicker} from '@app/features/messaging/hooks/useTextareaEmojiPicker';
import {useTextareaPaste} from '@app/features/messaging/hooks/useTextareaPaste';
import {useTextareaSegments} from '@app/features/messaging/hooks/useTextareaSegments';
import type {Message} from '@app/features/messaging/models/MessagingMessage';
import MessageEdit from '@app/features/messaging/state/MessageEdit';
import TextareaSelection from '@app/features/messaging/state/TextareaSelection';
import {applyMarkdownSegments} from '@app/features/messaging/utils/MarkdownToSegmentUtils';
import {
	captureTextareaSelection,
	focusTextareaWithSelection,
} from '@app/features/messaging/utils/TextareaSelectionUtils';
import {ComponentDispatch} from '@app/features/platform/utils/ComponentBus';
import * as PopoutCommands from '@app/features/ui/commands/PopoutCommands';
import {Scroller, type ScrollerHandle} from '@app/features/ui/components/Scroller';
import FocusRing from '@app/features/ui/focus_ring/FocusRing';
import {openPopout} from '@app/features/ui/popover/PopoverPopout';
import KeyboardMode from '@app/features/ui/state/KeyboardMode';
import MobileLayout from '@app/features/ui/state/MobileLayout';
import Users from '@app/features/user/state/Users';
import {MAX_MESSAGE_LENGTH_NON_PREMIUM, MAX_MESSAGE_LENGTH_PREMIUM} from '@fluxer/constants/src/LimitConstants';
import {Trans, useLingui} from '@lingui/react/macro';
import {SmileyIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback, useEffect, useId, useMemo, useRef, useState} from 'react';

export const EditingMessageInput = observer(
	({
		channel,
		message,
		onCancel,
		onSubmit,
	}: {
		channel: Channel;
		message: Message;
		onCancel: () => void;
		onSubmit: (actualContent?: string) => void;
	}) => {
		const {i18n} = useLingui();
		const currentUser = Users.getCurrentUser();
		const maxMessageLength = currentUser?.maxMessageLength ?? MAX_MESSAGE_LENGTH_NON_PREMIUM;
		const premiumMaxLength = Limits.getPremiumValue('max_message_length', MAX_MESSAGE_LENGTH_PREMIUM);
		const [value, setValue] = useState(() => {
			const persistedDraft =
				MessageEdit.getEditingContent(channel.id, message.id) ?? MessageEdit.getDraftContent(message.id);
			return persistedDraft ?? message.content;
		});
		const textareaRef = useRef<HTMLTextAreaElement>(null);
		const [expressionPickerOpen, setExpressionPickerOpen] = useState(false);
		const autocompleteListId = useId();
		const hasInitializedRef = useRef(false);
		const containerRef = useRef<HTMLDivElement>(null);
		const scrollerRef = useRef<ScrollerHandle>(null);
		const mobileLayout = MobileLayout;
		const expressionPickerTriggerRef = useRef<HTMLButtonElement>(null);
		const [isFocused, setIsFocused] = useState(false);
		useMarkdownKeybinds(isFocused);
		const [textareaHeight, setTextareaHeight] = useState(0);
		const hasScrolledInitiallyRef = useRef(false);
		const shouldStickToBottomRef = useRef(true);
		const hasFocusedInitiallyRef = useRef(false);
		const editingDisabled =
			channel.guildId != null &&
			GuildVerification.getFailureReason(channel.guildId) === VerificationFailureReason.TIMED_OUT;
		const placeholderText = editingDisabled ? i18n._(CANNOT_SEND_MESSAGES_IN_CHANNEL_DESCRIPTOR) : '';
		const rememberTextareaSelection = useCallback(() => {
			const textarea = textareaRef.current;
			if (!textarea) {
				return;
			}
			if (!MessageEdit.isEditing(channel.id, message.id)) {
				return;
			}
			TextareaSelection.setEditingSelection(channel.id, message.id, captureTextareaSelection(textarea));
		}, [channel.id, message.id]);
		const focusEditingTextarea = useCallback(
			(fallbackPosition?: number) => {
				const textarea = textareaRef.current;
				if (!textarea) {
					return;
				}
				focusTextareaWithSelection(
					textarea,
					TextareaSelection.getEditingSelection(channel.id, message.id),
					fallbackPosition,
				);
			},
			[channel.id, message.id],
		);
		const handleScroll = useCallback(() => {
			const distance = scrollerRef.current?.getDistanceFromBottom?.();
			if (distance == null) return;
			shouldStickToBottomRef.current = distance <= 8;
		}, []);
		const {segmentManagerRef, previousValueRef, displayToActual, prepareTextChange, handleTextChange} =
			useTextareaSegments();
		const handleFormattingShortcut = useMarkdownFormattingShortcut({
			textareaRef,
			value,
			setValue,
			handleTextChange,
			previousValueRef,
		});
		const handleTextareaKeyDown = useCallback(
			(event: React.KeyboardEvent<HTMLTextAreaElement>) => {
				handleFormattingShortcut(event);
				if (event.defaultPrevented) {
					return;
				}
				if (event.key === 'Escape') {
					event.preventDefault();
					event.stopPropagation();
					onCancel();
				}
			},
			[handleFormattingShortcut, onCancel],
		);
		const {handleEmojiSelect} = useTextareaEmojiPicker({
			setValue,
			textareaRef,
			segmentManagerRef,
			previousValueRef,
			prepareTextChange,
		});
		const actualContent = useMemo(() => displayToActual(value), [displayToActual, value]);
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
			value,
			setValue,
			textareaRef,
			segmentManagerRef,
			previousValueRef,
			prepareTextChange,
			allowedTriggers: ['emoji', 'emojiReaction', 'mention', 'channel'],
		});
		useTextareaPaste({
			channel,
			textareaRef,
			segmentManagerRef,
			setValue,
			previousValueRef,
			prepareTextChange,
			disabled: editingDisabled,
		});
		useEffect(() => {
			if (editingDisabled) return;
			const textarea = textareaRef.current;
			if (!textarea) return;
			const rememberActiveTextareaSelection = () => {
				if (document.activeElement !== textarea) return;
				rememberTextareaSelection();
			};
			textarea.addEventListener('blur', rememberTextareaSelection);
			textarea.addEventListener('input', rememberActiveTextareaSelection);
			textarea.addEventListener('keyup', rememberActiveTextareaSelection);
			textarea.addEventListener('mouseup', rememberActiveTextareaSelection);
			textarea.addEventListener('select', rememberActiveTextareaSelection);
			document.addEventListener('selectionchange', rememberActiveTextareaSelection);
			return () => {
				rememberTextareaSelection();
				textarea.removeEventListener('blur', rememberTextareaSelection);
				textarea.removeEventListener('input', rememberActiveTextareaSelection);
				textarea.removeEventListener('keyup', rememberActiveTextareaSelection);
				textarea.removeEventListener('mouseup', rememberActiveTextareaSelection);
				textarea.removeEventListener('select', rememberActiveTextareaSelection);
				document.removeEventListener('selectionchange', rememberActiveTextareaSelection);
			};
		}, [editingDisabled, rememberTextareaSelection]);
		useEffect(() => {
			if (editingDisabled) {
				return;
			}
			if (hasFocusedInitiallyRef.current) {
				textareaRef.current?.focus();
				return;
			}
			if (!hasInitializedRef.current && value) {
				hasInitializedRef.current = true;
				const displayText = applyMarkdownSegments(value, channel.guildId, segmentManagerRef.current);
				setValue(displayText);
				previousValueRef.current = displayText;
				hasFocusedInitiallyRef.current = true;
				requestAnimationFrame(() => {
					focusEditingTextarea(displayText.length);
				});
			} else {
				hasFocusedInitiallyRef.current = true;
				focusEditingTextarea();
			}
		}, [editingDisabled, value, channel.guildId, segmentManagerRef, previousValueRef, focusEditingTextarea]);
		useEffect(() => {
			if (!editingDisabled) {
				return;
			}
			textareaRef.current?.blur();
			PopoutCommands.close(`editing-expression-picker-${channel.id}`);
			setExpressionPickerOpen(false);
		}, [channel.id, editingDisabled]);
		useEffect(() => {
			if (hasScrolledInitiallyRef.current) return;
			if (!scrollerRef.current) return;
			if (textareaHeight <= 0) return;
			scrollerRef.current.scrollToBottom({animate: false});
			hasScrolledInitiallyRef.current = true;
			shouldStickToBottomRef.current = true;
		}, [textareaHeight]);
		useEffect(() => {
			if (hasInitializedRef.current) {
				MessageEdit.setEditingContent(channel.id, message.id, actualContent);
			}
		}, [channel.id, message.id, actualContent]);
		useEffect(() => {
			const unsubscribe = ComponentDispatch.subscribe('FOCUS_TEXTAREA', (payload?: unknown) => {
				const {channelId, enterKeyboardMode} = (payload ?? {}) as {channelId?: string; enterKeyboardMode?: boolean};
				if (channelId && channelId !== channel.id) return;
				if (editingDisabled) return false;
				if (!MessageEdit.isEditing(channel.id, message.id)) return false;
				if (enterKeyboardMode) {
					KeyboardMode.enterKeyboardMode(true);
				} else {
					KeyboardMode.exitKeyboardMode();
				}
				focusEditingTextarea();
				return true;
			});
			return unsubscribe;
		}, [channel.id, editingDisabled, focusEditingTextarea, message.id]);
		const handleSubmit = useCallback(() => {
			if (editingDisabled) {
				return;
			}
			if (actualContent.length > maxMessageLength) {
				return;
			}
			onSubmit(actualContent);
		}, [actualContent, editingDisabled, onSubmit, maxMessageLength]);
		const handleExpressionPickerToggle = useCallback(() => {
			if (editingDisabled) {
				return;
			}
			const triggerElement = expressionPickerTriggerRef.current;
			if (!triggerElement) return;
			const popoutKey = `editing-expression-picker-${channel.id}`;
			const isOpen = expressionPickerOpen;
			if (isOpen) {
				PopoutCommands.close(popoutKey);
				setExpressionPickerOpen(false);
			} else {
				openPopout(
					triggerElement,
					{
						render: ({onClose}) => (
							<ExpressionPickerPopout
								channelId={channel.id}
								onEmojiSelect={handleEmojiSelect}
								onClose={onClose}
								visibleTabs={['emojis']}
								data-flx="channel.editing-message-input.handle-expression-picker-toggle.expression-picker-popout"
							/>
						),
						position: 'top-end',
						animationType: 'none',
						offsetCrossAxis: 16,
						onOpen: () => setExpressionPickerOpen(true),
						onClose: () => setExpressionPickerOpen(false),
						returnFocusRef: textareaRef,
					},
					popoutKey,
				);
			}
		}, [channel.id, editingDisabled, expressionPickerOpen, handleEmojiSelect, textareaRef]);
		useEffect(() => {
			const unsubscribe = ComponentDispatch.subscribe('EDITING_EXPRESSION_PICKER_TAB_TOGGLE', (payload?: unknown) => {
				const data = payload as {channelId?: string; messageId?: string; tab?: string} | undefined;
				if (!data || data.channelId !== channel.id || data.messageId !== message.id || data.tab !== 'emojis') return;
				handleExpressionPickerToggle();
			});
			return unsubscribe;
		}, [channel.id, handleExpressionPickerToggle, message.id]);
		const showAutocomplete = !editingDisabled && isAutocompleteAttached;
		const displayValue = editingDisabled ? '' : value;
		const displayContentLength = editingDisabled ? 0 : actualContent.length;
		return (
			<>
				{showAutocomplete && (
					<Autocomplete
						type={autocompleteType}
						onSelect={handleSelect}
						selectedIndex={selectedIndex}
						options={autocompleteOptions}
						setSelectedIndex={setSelectedIndex}
						referenceElement={containerRef.current}
						query={autocompleteQuery}
						listboxId={autocompleteListId}
						data-flx="channel.editing-message-input.autocomplete.select"
					/>
				)}
				<FocusRing within={true} offset={-2} data-flx="channel.editing-message-input.focus-ring">
					<div
						ref={containerRef}
						className={styles.textareaContainer}
						data-flx="channel.editing-message-input.textarea-container"
					>
						<div
							className={clsx(styles.mainWrapperEditing, editingDisabled && wrapperStyles.disabled)}
							data-flx="channel.editing-message-input.main-wrapper-editing"
						>
							<div className={styles.contentAreaEditing} data-flx="channel.editing-message-input.content-area-editing">
								<Scroller
									ref={scrollerRef}
									fade={true}
									className={editingStyles.scroller}
									key="editing-message-input-scroller"
									onScroll={handleScroll}
									data-flx="channel.editing-message-input.scroller"
								>
									<div className={editingStyles.flexColumnContainer} data-flx="channel.editing-message-input.div">
										<span
											key={textareaHeight}
											className={editingStyles.hiddenSpan}
											data-flx="channel.editing-message-input.span"
										/>
										<TextareaInputField
											channelId={channel.id}
											disabled={editingDisabled}
											isMobile={mobileLayout.enabled}
											value={displayValue}
											placeholder={placeholderText}
											textareaRef={textareaRef}
											scrollerRef={scrollerRef}
											shouldStickToBottomRef={shouldStickToBottomRef}
											isFocused={isFocused}
											isAutocompleteAttached={showAutocomplete}
											autocompleteListId={autocompleteListId}
											autocompleteOptions={autocompleteOptions}
											selectedIndex={selectedIndex}
											onFocus={() => setIsFocused(true)}
											onBlur={() => setIsFocused(false)}
											onChange={(newValue, inputType, hint) => {
												handleTextChange(newValue, previousValueRef.current, inputType, hint);
												setValue(newValue);
											}}
											onHeightChange={setTextareaHeight}
											onCursorMove={onCursorMove}
											onArrowUp={() => {}}
											onEnter={handleSubmit}
											onAutocompleteSelect={handleSelect}
											setSelectedIndex={setSelectedIndex}
											onKeyDown={handleTextareaKeyDown}
											data-flx="channel.editing-message-input.textarea-input-field.text-change"
										/>
									</div>
								</Scroller>
							</div>
							<div
								className={styles.buttonContainerEditing}
								data-flx="channel.editing-message-input.button-container-editing"
							>
								<TextareaButton
									ref={mobileLayout.enabled ? undefined : expressionPickerTriggerRef}
									icon={SmileyIcon}
									iconProps={{weight: 'fill'}}
									label={i18n._(EMOJIS_DESCRIPTOR)}
									isSelected={expressionPickerOpen}
									onClick={mobileLayout.enabled ? () => setExpressionPickerOpen(true) : handleExpressionPickerToggle}
									disabled={editingDisabled}
									data-expression-picker-tab="emojis"
									compact={true}
									data-flx="channel.editing-message-input.textarea-button.set-expression-picker-open"
								/>
							</div>
						</div>
						<MessageCharacterCounter
							currentLength={displayContentLength}
							maxLength={maxMessageLength}
							canUpgrade={maxMessageLength < premiumMaxLength}
							premiumMaxLength={premiumMaxLength}
							data-flx="channel.editing-message-input.message-character-counter"
						/>
					</div>
				</FocusRing>
				<div className={editingStyles.footer} data-flx="channel.editing-message-input.div--2">
					<div data-flx="channel.editing-message-input.div--3">
						<Trans>
							escape to{' '}
							<FocusRing offset={-2} data-flx="channel.editing-message-input.focus-ring--2">
								<button
									type="button"
									className={editingStyles.footerLink}
									onClick={onCancel}
									key="cancel"
									data-flx="channel.editing-message-input.button.cancel"
								>
									cancel
								</button>
							</FocusRing>
						</Trans>
						<div
							aria-hidden={true}
							className={editingStyles.separator}
							data-flx="channel.editing-message-input.div--4"
						/>
						<Trans>
							enter to{' '}
							<FocusRing offset={-2} enabled={!editingDisabled} data-flx="channel.editing-message-input.focus-ring--3">
								<button
									type="button"
									className={editingStyles.footerLink}
									onClick={handleSubmit}
									disabled={editingDisabled}
									key="save"
									data-flx="channel.editing-message-input.button.submit"
								>
									save
								</button>
							</FocusRing>
						</Trans>
					</div>
				</div>
				{mobileLayout.enabled && !editingDisabled && (
					<ExpressionPickerSheet
						isOpen={expressionPickerOpen}
						onClose={() => setExpressionPickerOpen(false)}
						channelId={channel.id}
						onEmojiSelect={handleEmojiSelect}
						visibleTabs={['emojis']}
						selectedTab="emojis"
						data-flx="channel.editing-message-input.expression-picker-sheet"
					/>
				)}
			</>
		);
	},
);
