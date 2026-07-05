// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	Autocomplete,
	type AutocompleteOption,
	type AutocompleteType,
	getAutocompleteOptionId,
} from '@app/features/channel/components/Autocomplete';
import type {FlatEmoji} from '@app/features/emoji/types/EmojiTypes';
import {ExpressionPickerPopout} from '@app/features/expressions/components/popouts/ExpressionPickerPopout';
import {useMarkdownKeybinds} from '@app/features/messaging/hooks/useMarkdownKeybinds';
import {useTextareaAutocompleteKeyboard} from '@app/features/messaging/hooks/useTextareaAutocompleteKeyboard';
import {CharacterCounter} from '@app/features/ui/character_counter/CharacterCounter';
import {Textarea} from '@app/features/ui/components/form/FormInput';
import FocusRing from '@app/features/ui/focus_ring/FocusRing';
import {Popout} from '@app/features/ui/popover/PopoverPopout';
import styles from '@app/features/user/components/modals/tabs/my_profile_tab/BioEditor.module.css';
import {msg} from '@lingui/core/macro';
import {Trans, useLingui} from '@lingui/react/macro';
import {SmileyIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback, useId, useState} from 'react';

const ABOUT_ME_DESCRIPTOR = msg({
	message: 'About me',
	comment: 'Short label in the bio editor. Keep it concise.',
});
const OPEN_EMOJI_PICKER_DESCRIPTOR = msg({
	message: 'Open emoji picker',
	comment: 'Button or menu action label in the bio editor. Keep it concise.',
});

interface BioEditorProps {
	value: string;
	onChange: (value: string, inputType?: string) => void;
	onEmojiSelect: (emoji: FlatEmoji, shiftKey?: boolean) => boolean;
	placeholder?: string;
	displayMaxLength: number;
	actualLength: number;
	actualMaxLength: number;
	disabled?: boolean;
	isMobile: boolean;
	errorMessage?: string;
	textareaRef: React.RefObject<HTMLTextAreaElement | null>;
	emojiPickerOpen: boolean;
	onEmojiPickerOpenChange: (open: boolean) => void;
	containerRef: React.RefObject<HTMLDivElement | null>;
	autocompleteQuery?: string;
	autocompleteOptions?: Array<AutocompleteOption>;
	autocompleteType?: AutocompleteType;
	selectedIndex?: number;
	isAutocompleteAttached?: boolean;
	setSelectedIndex?: React.Dispatch<React.SetStateAction<number>>;
	onCursorMove?: () => void;
	handleSelect?: (option: AutocompleteOption) => void;
	autocompleteZIndex?: number;
}

export const BioEditor = observer(
	({
		value,
		onChange,
		onEmojiSelect,
		placeholder,
		displayMaxLength,
		actualLength,
		actualMaxLength,
		disabled,
		isMobile,
		errorMessage,
		textareaRef,
		emojiPickerOpen,
		onEmojiPickerOpenChange,
		containerRef,
		autocompleteQuery,
		autocompleteOptions,
		autocompleteType,
		selectedIndex,
		isAutocompleteAttached,
		setSelectedIndex,
		onCursorMove,
		handleSelect,
		autocompleteZIndex,
	}: BioEditorProps) => {
		const {i18n} = useLingui();
		const [isFocused, setIsFocused] = useState(false);
		const autocompleteListId = useId();
		useMarkdownKeybinds(isFocused);
		const handleBioEmojiSelect = useCallback(
			(emoji: FlatEmoji, shiftKey?: boolean) => {
				const didInsert = onEmojiSelect(emoji, shiftKey);
				if (didInsert && !shiftKey) {
					onEmojiPickerOpenChange(false);
				}
				return didInsert;
			},
			[onEmojiSelect, onEmojiPickerOpenChange],
		);
		const {handleKeyDown} = useTextareaAutocompleteKeyboard({
			isAutocompleteAttached: isAutocompleteAttached || false,
			autocompleteOptions: autocompleteOptions || [],
			selectedIndex: selectedIndex || 0,
			setSelectedIndex: setSelectedIndex || (() => {}),
			handleSelect: handleSelect || (() => {}),
		});
		const activeAutocompleteOptionId =
			isAutocompleteAttached && autocompleteOptions?.[selectedIndex || 0]
				? getAutocompleteOptionId(autocompleteListId, selectedIndex || 0)
				: undefined;
		return (
			<div data-flx="user.my-profile-tab.bio-editor.div">
				{isAutocompleteAttached && handleSelect && setSelectedIndex && (
					<Autocomplete
						type={autocompleteType || 'emoji'}
						onSelect={handleSelect}
						selectedIndex={selectedIndex || 0}
						options={autocompleteOptions || []}
						setSelectedIndex={setSelectedIndex}
						referenceElement={containerRef.current}
						query={autocompleteQuery || ''}
						zIndex={autocompleteZIndex}
						listboxId={autocompleteListId}
						data-flx="user.my-profile-tab.bio-editor.autocomplete.select"
					/>
				)}
				<div ref={containerRef} data-flx="user.my-profile-tab.bio-editor.div--2">
					<Textarea
						ref={textareaRef}
						label={i18n._(ABOUT_ME_DESCRIPTOR)}
						placeholder={placeholder}
						maxLength={displayMaxLength}
						minRows={4}
						maxRows={4}
						showCharacterCount={true}
						value={value}
						onChange={(e) => {
							const nativeEvent = e.nativeEvent as InputEvent;
							onChange(e.target.value, typeof nativeEvent.inputType === 'string' ? nativeEvent.inputType : undefined);
						}}
						onFocus={() => setIsFocused(true)}
						onBlur={() => setIsFocused(false)}
						onKeyDown={handleKeyDown}
						aria-autocomplete="list"
						aria-controls={isAutocompleteAttached ? autocompleteListId : undefined}
						aria-expanded={isAutocompleteAttached}
						aria-haspopup="listbox"
						aria-activedescendant={activeAutocompleteOptionId}
						onKeyUp={onCursorMove}
						onClick={onCursorMove}
						error={errorMessage}
						disabled={disabled}
						characterCountTooltip={() => (
							<CharacterCounter
								currentLength={actualLength}
								maxLength={actualMaxLength}
								canUpgrade={false}
								premiumMaxLength={actualMaxLength}
								onUpgradeClick={() => undefined}
								data-flx="user.my-profile-tab.bio-editor.character-counter"
							/>
						)}
						innerActionButton={
							isMobile ? (
								<FocusRing offset={-2} enabled={!disabled} data-flx="user.my-profile-tab.bio-editor.focus-ring">
									<button
										type="button"
										onClick={() => onEmojiPickerOpenChange(true)}
										className={clsx(styles.emojiButton, emojiPickerOpen && styles.emojiButtonActive)}
										disabled={disabled}
										aria-label={i18n._(OPEN_EMOJI_PICKER_DESCRIPTOR)}
										aria-haspopup="dialog"
										aria-expanded={emojiPickerOpen}
										data-flx="user.my-profile-tab.bio-editor.emoji-button.emoji-picker-open-change"
									>
										<SmileyIcon size={20} weight="fill" data-flx="user.my-profile-tab.bio-editor.smiley-icon" />
									</button>
								</FocusRing>
							) : (
								<Popout
									position="bottom-end"
									animationType="none"
									offsetMainAxis={8}
									offsetCrossAxis={0}
									onOpen={() => onEmojiPickerOpenChange(true)}
									onClose={() => onEmojiPickerOpenChange(false)}
									returnFocusRef={textareaRef}
									render={({onClose}) => (
										<ExpressionPickerPopout
											onEmojiSelect={(emoji, shiftKey) => {
												const didInsert = handleBioEmojiSelect(emoji, shiftKey);
												if (didInsert && !shiftKey) {
													onClose();
												}
											}}
											onClose={onClose}
											visibleTabs={['emojis']}
											data-flx="user.my-profile-tab.bio-editor.expression-picker-popout"
										/>
									)}
									data-flx="user.my-profile-tab.bio-editor.popout"
								>
									<FocusRing offset={-2} enabled={!disabled} data-flx="user.my-profile-tab.bio-editor.focus-ring--2">
										<button
											type="button"
											className={clsx(styles.emojiButton, emojiPickerOpen && styles.emojiButtonActive)}
											disabled={disabled}
											aria-label={i18n._(OPEN_EMOJI_PICKER_DESCRIPTOR)}
											aria-haspopup="dialog"
											aria-expanded={emojiPickerOpen}
											data-flx="user.my-profile-tab.bio-editor.emoji-button"
										>
											<SmileyIcon size={20} weight="fill" data-flx="user.my-profile-tab.bio-editor.smiley-icon--2" />
										</button>
									</FocusRing>
								</Popout>
							)
						}
						data-flx="user.my-profile-tab.bio-editor.textarea.cursor-move"
					/>
				</div>
				<div className={styles.description} data-flx="user.my-profile-tab.bio-editor.description">
					<Trans>You can use links, emoji, and markdown.</Trans>
				</div>
			</div>
		);
	},
);
