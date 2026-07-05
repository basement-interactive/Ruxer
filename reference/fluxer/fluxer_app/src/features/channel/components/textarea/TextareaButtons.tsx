// SPDX-License-Identifier: AGPL-3.0-or-later

import Accessibility from '@app/features/accessibility/state/Accessibility';
import HoldToRecordButton from '@app/features/channel/components/textarea/HoldToRecordButton';
import {TextareaButton} from '@app/features/channel/components/textarea/TextareaButton';
import textareaButtonsStyles from '@app/features/channel/components/textarea/TextareaButtons.module.css';
import styles from '@app/features/channel/components/textarea/TextareaInput.module.css';
import type {ExpressionPickerTabType} from '@app/features/expressions/components/popouts/ExpressionPickerPopout';
import {
	EMOJIS_DESCRIPTOR,
	GIFS_DESCRIPTOR,
	MEDIA_DESCRIPTOR,
	STICKERS_DESCRIPTOR,
} from '@app/features/i18n/utils/CommonMessageDescriptors';
import {getReducedMotionProps} from '@app/features/ui/utils/ReducedMotionAnimation';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {
	GifIcon,
	ImageSquareIcon,
	MicrophoneIcon,
	PaperPlaneRightIcon,
	SmileyIcon,
	StickerIcon,
} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {AnimatePresence, motion} from 'framer-motion';
import React from 'react';

const VOICE_MESSAGE_DESCRIPTOR = msg({
	message: 'Voice message',
	comment: 'Short label in the channel and chat textarea buttons. Keep it concise.',
});
const SEND_MESSAGE_DESCRIPTOR = msg({
	message: 'Send message',
	comment: 'Button or menu action label in the channel and chat textarea buttons. Keep it concise.',
});

interface TextareaButtonsProps {
	disabled: boolean;
	showAllButtons: boolean;
	showGifButton: boolean;
	showMemesButton: boolean;
	showStickersButton: boolean;
	showEmojiButton: boolean;
	showMessageSendButton: boolean;
	showVoiceMessageButton?: boolean;
	onVoiceMessageClick?: () => void;
	channelId: string;
	expressionPickerOpen: boolean;
	selectedTab: ExpressionPickerTabType;
	isMobile: boolean;
	isSlowmodeActive: boolean;
	isOverLimit: boolean;
	hasContent: boolean;
	hasAttachments: boolean;
	expressionPickerTriggerRef: React.RefObject<HTMLButtonElement | null>;
	invisibleExpressionPickerTriggerRef: React.RefObject<HTMLDivElement | null>;
	onExpressionPickerToggle: (tab: ExpressionPickerTabType) => void;
	onSubmit: () => void;
	disableSendButton?: boolean;
}

export const TextareaButtons = React.forwardRef<HTMLDivElement, TextareaButtonsProps>(
	(
		{
			disabled,
			showAllButtons,
			showGifButton,
			showMemesButton,
			showStickersButton,
			showEmojiButton,
			showMessageSendButton,
			showVoiceMessageButton,
			onVoiceMessageClick,
			channelId,
			expressionPickerOpen,
			selectedTab,
			isMobile,
			isSlowmodeActive,
			isOverLimit,
			hasContent,
			hasAttachments,
			expressionPickerTriggerRef,
			invisibleExpressionPickerTriggerRef,
			onExpressionPickerToggle,
			onSubmit,
			disableSendButton,
		},
		ref,
	) => {
		const {i18n} = useLingui();
		if (disabled) {
			return null;
		}
		const buttonSwapMotion = getReducedMotionProps(
			{
				initial: {scale: 0.8, opacity: 0},
				animate: {scale: 1, opacity: 1},
				exit: {scale: 0.8, opacity: 0},
				transition: {duration: 0.15, ease: 'easeOut'},
			},
			Accessibility.useReducedMotion,
		);
		const shouldShowDesktopSendButton = showMessageSendButton;
		const baseSendDisabled = isSlowmodeActive || isOverLimit || disableSendButton;
		const sendButtonDisabled = baseSendDisabled || (!hasContent && !hasAttachments);
		const shouldShowHoldToRecord = isMobile && showVoiceMessageButton && !hasContent && !hasAttachments;
		return (
			<div
				className={clsx(styles.buttonContainerDense, styles.sideButtonPadding)}
				ref={ref}
				data-flx="channel.textarea.textarea-buttons.button-container-dense"
			>
				{!isMobile && showAllButtons && (
					<>
						{showGifButton && (
							<TextareaButton
								icon={GifIcon}
								label={i18n._(GIFS_DESCRIPTOR)}
								isSelected={expressionPickerOpen && selectedTab === 'gifs'}
								onClick={() => onExpressionPickerToggle('gifs')}
								data-expression-picker-tab="gifs"
								keybindAction="chat_toggle_gif"
								data-flx="channel.textarea.textarea-buttons.textarea-button.expression-picker-toggle"
							/>
						)}
						{showMemesButton && (
							<TextareaButton
								icon={ImageSquareIcon}
								label={i18n._(MEDIA_DESCRIPTOR)}
								isSelected={expressionPickerOpen && selectedTab === 'memes'}
								onClick={() => onExpressionPickerToggle('memes')}
								data-expression-picker-tab="memes"
								keybindAction="chat_toggle_saved_media"
								data-flx="channel.textarea.textarea-buttons.textarea-button.expression-picker-toggle--2"
							/>
						)}
						{showStickersButton && (
							<TextareaButton
								icon={StickerIcon}
								label={i18n._(STICKERS_DESCRIPTOR)}
								isSelected={expressionPickerOpen && selectedTab === 'stickers'}
								onClick={() => onExpressionPickerToggle('stickers')}
								data-expression-picker-tab="stickers"
								keybindAction="chat_toggle_sticker"
								data-flx="channel.textarea.textarea-buttons.textarea-button.expression-picker-toggle--3"
							/>
						)}
					</>
				)}
				{showEmojiButton && (
					<TextareaButton
						ref={isMobile ? undefined : expressionPickerTriggerRef}
						icon={SmileyIcon}
						iconProps={{weight: 'fill'}}
						label={i18n._(EMOJIS_DESCRIPTOR)}
						isSelected={expressionPickerOpen && selectedTab === 'emojis'}
						onClick={() => onExpressionPickerToggle('emojis')}
						data-expression-picker-tab="emojis"
						keybindAction="chat_toggle_emoji"
						data-flx="channel.textarea.textarea-buttons.textarea-button.expression-picker-toggle--4"
					/>
				)}
				<div
					ref={invisibleExpressionPickerTriggerRef}
					className={textareaButtonsStyles.invisibleTrigger}
					data-flx="channel.textarea.textarea-buttons.div"
				/>
				{isMobile && showVoiceMessageButton && onVoiceMessageClick && !shouldShowHoldToRecord && (
					<TextareaButton
						icon={MicrophoneIcon}
						label={i18n._(VOICE_MESSAGE_DESCRIPTOR)}
						onClick={onVoiceMessageClick}
						data-flx="channel.textarea.textarea-buttons.textarea-button.voice-message-click"
					/>
				)}
				{isMobile && (
					<AnimatePresence mode="wait" initial={false} data-flx="channel.textarea.textarea-buttons.animate-presence">
						{shouldShowHoldToRecord ? (
							<motion.div
								key="hold-to-record"
								data-flx="channel.textarea.textarea-buttons.div--2"
								{...buttonSwapMotion}
							>
								<HoldToRecordButton
									channelId={channelId}
									disabled={baseSendDisabled}
									onFallback={onVoiceMessageClick}
									data-flx="channel.textarea.textarea-buttons.hold-to-record-button"
								/>
							</motion.div>
						) : (
							<motion.div key="send-button" data-flx="channel.textarea.textarea-buttons.div--3" {...buttonSwapMotion}>
								<TextareaButton
									disabled={sendButtonDisabled}
									icon={PaperPlaneRightIcon}
									label={i18n._(SEND_MESSAGE_DESCRIPTOR)}
									onClick={onSubmit}
									keybindCombo={{key: 'Enter'}}
									data-flx="channel.textarea.textarea-buttons.textarea-button.submit"
								/>
							</motion.div>
						)}
					</AnimatePresence>
				)}
				{!isMobile && shouldShowDesktopSendButton && (
					<>
						<div className={styles.divider} data-flx="channel.textarea.textarea-buttons.divider" />
						<TextareaButton
							disabled={isSlowmodeActive || isOverLimit || (!hasContent && !hasAttachments) || disableSendButton}
							icon={PaperPlaneRightIcon}
							label={i18n._(SEND_MESSAGE_DESCRIPTOR)}
							onClick={onSubmit}
							keybindCombo={{key: 'Enter'}}
							data-flx="channel.textarea.textarea-buttons.textarea-button.submit--2"
						/>
					</>
				)}
			</div>
		);
	},
);

TextareaButtons.displayName = 'TextareaButtons';
