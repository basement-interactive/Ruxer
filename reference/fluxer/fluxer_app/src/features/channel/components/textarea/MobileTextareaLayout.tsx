// SPDX-License-Identifier: AGPL-3.0-or-later

import Accessibility from '@app/features/accessibility/state/Accessibility';
import type {AutocompleteOption} from '@app/features/channel/components/Autocomplete';
import wrapperStyles from '@app/features/channel/components/textarea/InputWrapper.module.css';
import {transitionMobileTextareaButtonState} from '@app/features/channel/components/textarea/MobileTextareaButtonStateMachine';
import styles from '@app/features/channel/components/textarea/MobileTextareaLayout.module.css';
import textareaStyles from '@app/features/channel/components/textarea/TextareaInput.module.css';
import {TextareaInputField} from '@app/features/channel/components/textarea/TextareaInputField';
import VoiceMessageRecorder from '@app/features/channel/components/VoiceMessageRecorder';
import {EMOJIS_DESCRIPTOR} from '@app/features/i18n/utils/CommonMessageDescriptors';
import type {TextareaTextChangeHint} from '@app/features/messaging/utils/TextareaSegmentManager';
import {Scroller, type ScrollerHandle} from '@app/features/ui/components/Scroller';
import {getReducedMotionProps, type MotionAnimation} from '@app/features/ui/utils/ReducedMotionAnimation';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {ArrowUpIcon, PlusIcon, SmileyIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {AnimatePresence, motion} from 'framer-motion';
import type React from 'react';
import {type Dispatch, type SetStateAction, useMemo, useRef} from 'react';

const OPEN_MENU_DESCRIPTOR = msg({
	message: 'Open menu',
	comment: 'Button or menu action label in the channel and chat mobile textarea layout. Keep it concise.',
});
const SEND_MESSAGE_DESCRIPTOR = msg({
	message: 'Send message',
	comment: 'Button or menu action label in the channel and chat mobile textarea layout. Keep it concise.',
});
const MOBILE_BUTTON_SWAP_MOTION: MotionAnimation = {
	initial: {opacity: 0, scale: 0.86, y: 3},
	animate: {opacity: 1, scale: 1, y: 0},
	exit: {opacity: 0, scale: 0.9, y: -2},
	transition: {
		opacity: {duration: 0.08},
		y: {duration: 0.08, ease: 'easeOut'},
		scale: {type: 'spring', stiffness: 560, damping: 28, mass: 0.55},
	},
};

interface MobileTextareaLayoutProps {
	disabled: boolean;
	canAttachFiles: boolean;
	value: string;
	placeholderText: string;
	textareaRef: React.RefObject<HTMLTextAreaElement | null>;
	scrollerRef: React.RefObject<ScrollerHandle | null>;
	isFocused: boolean;
	isAutocompleteAttached: boolean;
	autocompleteListId?: string;
	autocompleteOptions: Array<AutocompleteOption>;
	selectedIndex: number;
	channelId: string;
	isSlowmodeActive: boolean;
	isOverCharacterLimit: boolean;
	isEditingMessage: boolean;
	hasContent: boolean;
	hasAttachments: boolean;
	hasPendingSticker?: boolean;
	isEditingScheduledMessage: boolean;
	onFocus: () => void;
	onBlur: () => void;
	onChange: (value: string, inputType?: string, hint?: TextareaTextChangeHint) => void;
	onHeightChange: (height: number) => void;
	onCursorMove: () => void;
	onArrowUp: (event: React.KeyboardEvent) => void;
	onSubmit: () => void;
	onAutocompleteSelect: (option: AutocompleteOption) => void;
	setSelectedIndex: Dispatch<SetStateAction<number>>;
	onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
	onPlusClick: () => void;
	onEmojiClick: () => void;
}

export function MobileTextareaLayout({
	disabled,
	canAttachFiles,
	value,
	placeholderText,
	textareaRef,
	scrollerRef,
	isFocused,
	isAutocompleteAttached,
	autocompleteListId,
	autocompleteOptions,
	selectedIndex,
	channelId,
	isSlowmodeActive,
	isOverCharacterLimit,
	isEditingMessage,
	hasContent,
	hasAttachments,
	hasPendingSticker,
	isEditingScheduledMessage,
	onFocus,
	onBlur,
	onChange,
	onHeightChange,
	onCursorMove,
	onArrowUp,
	onSubmit,
	onAutocompleteSelect,
	setSelectedIndex,
	onKeyDown,
	onPlusClick,
	onEmojiClick,
}: MobileTextareaLayoutProps) {
	const {i18n} = useLingui();
	const buttonSwapMotion = getReducedMotionProps(MOBILE_BUTTON_SWAP_MOTION, Accessibility.useReducedMotion);
	const rightButtonState = useMemo(
		() =>
			transitionMobileTextareaButtonState({
				disabled,
				canRecordVoice: canAttachFiles,
				value,
				isSlowmodeActive,
				isOverCharacterLimit,
				isEditingMessage,
				hasContent,
				hasAttachments,
				hasPendingSticker: Boolean(hasPendingSticker),
				isEditingScheduledMessage,
			}),
		[
			canAttachFiles,
			disabled,
			hasAttachments,
			hasContent,
			hasPendingSticker,
			isEditingMessage,
			isEditingScheduledMessage,
			isOverCharacterLimit,
			isSlowmodeActive,
			value,
		],
	);
	const sendButtonDisabled = rightButtonState.sendButton.disabled;
	const sendLockRef = useRef(false);
	const handleSendClick = () => {
		if (sendLockRef.current) {
			return;
		}
		sendLockRef.current = true;
		setTimeout(() => {
			sendLockRef.current = false;
		}, 500);
		onSubmit();
	};
	const shouldShowVoiceButton = rightButtonState.visibleButton === 'voice';
	const voiceButtonDisabled = rightButtonState.voiceButton.disabled;
	const voiceTooltipAnchorRef = useRef<HTMLDivElement | null>(null);
	return (
		<div
			className={clsx(styles.mobileTextareaWrapper, disabled && wrapperStyles.disabled)}
			data-flx="channel.textarea.mobile-textarea-layout.mobile-textarea-wrapper"
		>
			{!disabled && canAttachFiles && (
				<div
					className={styles.mobilePlusButtonContainer}
					data-flx="channel.textarea.mobile-textarea-layout.mobile-plus-button-container"
				>
					<button
						type="button"
						className={styles.mobilePlusButton}
						onClick={onPlusClick}
						aria-label={i18n._(OPEN_MENU_DESCRIPTOR)}
						data-flx="channel.textarea.mobile-textarea-layout.mobile-plus-button.plus-click"
					>
						<PlusIcon
							className={styles.mobilePlusButtonIcon}
							weight="bold"
							data-flx="channel.textarea.mobile-textarea-layout.mobile-plus-button-icon"
						/>
					</button>
				</div>
			)}
			<div
				className={styles.mobileContentWrapper}
				data-flx="channel.textarea.mobile-textarea-layout.mobile-content-wrapper"
			>
				<div
					className={styles.mobileInputContainer}
					ref={voiceTooltipAnchorRef}
					data-flx="channel.textarea.mobile-textarea-layout.mobile-input-container"
				>
					<div
						className={styles.mobileInputContent}
						data-flx="channel.textarea.mobile-textarea-layout.mobile-input-content"
					>
						<Scroller
							ref={scrollerRef}
							fade={true}
							className={textareaStyles.scroller}
							key="mobile-textarea-scroller"
							data-flx="channel.textarea.mobile-textarea-layout.scroller"
						>
							<div className={textareaStyles.flexColumn} data-flx="channel.textarea.mobile-textarea-layout.div">
								<TextareaInputField
									channelId={channelId}
									disabled={disabled}
									isMobile={true}
									value={value}
									placeholder={placeholderText}
									textareaRef={textareaRef}
									isFocused={isFocused}
									isAutocompleteAttached={isAutocompleteAttached}
									autocompleteListId={autocompleteListId}
									autocompleteOptions={autocompleteOptions}
									selectedIndex={selectedIndex}
									className={textareaStyles.textareaMobile}
									onFocus={onFocus}
									onBlur={onBlur}
									onChange={onChange}
									onHeightChange={onHeightChange}
									onCursorMove={onCursorMove}
									onArrowUp={onArrowUp}
									onEnter={onSubmit}
									onAutocompleteSelect={onAutocompleteSelect}
									setSelectedIndex={setSelectedIndex}
									onKeyDown={onKeyDown}
									data-flx="channel.textarea.mobile-textarea-layout.textarea-input-field.change"
								/>
							</div>
						</Scroller>
					</div>
					{!disabled && (
						<div
							className={styles.mobileEmojiButtonContainer}
							data-flx="channel.textarea.mobile-textarea-layout.mobile-emoji-button-container"
						>
							<button
								type="button"
								className={styles.mobileEmojiButton}
								onClick={onEmojiClick}
								aria-label={i18n._(EMOJIS_DESCRIPTOR)}
								data-flx="channel.textarea.mobile-textarea-layout.mobile-emoji-button.emoji-click"
							>
								<SmileyIcon
									className={styles.mobileEmojiButtonIcon}
									weight="fill"
									data-flx="channel.textarea.mobile-textarea-layout.mobile-emoji-button-icon"
								/>
							</button>
						</div>
					)}
				</div>
				<div
					className={styles.mobileRightButtonContainer}
					data-flx="channel.textarea.mobile-textarea-layout.mobile-right-button-container"
				>
					<AnimatePresence initial={false} data-flx="channel.textarea.mobile-textarea-layout.animate-presence">
						{shouldShowVoiceButton ? (
							<motion.div
								key="voice-button"
								className={styles.mobileRightButtonSlot}
								data-flx="channel.textarea.mobile-textarea-layout.div--2"
								{...buttonSwapMotion}
							>
								<VoiceMessageRecorder
									channelId={channelId}
									disabled={voiceButtonDisabled}
									tooltipAnchorRef={voiceTooltipAnchorRef}
									data-flx="channel.textarea.mobile-textarea-layout.voice-message-recorder"
								/>
							</motion.div>
						) : (
							<motion.div
								key="send-button"
								className={styles.mobileRightButtonSlot}
								data-flx="channel.textarea.mobile-textarea-layout.mobile-send-button.send-click"
								{...buttonSwapMotion}
							>
								<button
									type="button"
									className={styles.mobileSendButton}
									onClick={handleSendClick}
									aria-label={i18n._(SEND_MESSAGE_DESCRIPTOR)}
									disabled={sendButtonDisabled}
									data-flx="channel.textarea.mobile-textarea-layout.mobile-send-button.button"
								>
									<ArrowUpIcon
										className={styles.mobileRightButtonIcon}
										weight="bold"
										data-flx="channel.textarea.mobile-textarea-layout.mobile-right-button-icon"
									/>
								</button>
							</motion.div>
						)}
					</AnimatePresence>
				</div>
			</div>
		</div>
	);
}

MobileTextareaLayout.displayName = 'MobileTextareaLayout';
