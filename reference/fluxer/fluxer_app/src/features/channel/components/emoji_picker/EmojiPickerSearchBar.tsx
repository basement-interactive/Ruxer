// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/channel/components/emoji_picker/EmojiPickerSearchBar.module.css';
import {SkinToneSelector} from '@app/features/channel/components/emoji_picker/SkinToneSelector';
import {PickerSearchInput} from '@app/features/channel/components/shared/PickerSearchInput';
import type {FlatEmoji} from '@app/features/emoji/types/EmojiTypes';
import {isIMEComposing} from '@app/features/messaging/utils/IMECompositionUtils';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback, useEffect} from 'react';

const FIND_THE_EMOJI_OF_YOUR_DREAMS_DESCRIPTOR = msg({
	message: 'Find the emoji of your dreams',
	comment: 'Label in the channel and chat emoji picker search bar.',
});

interface EmojiPickerSearchBarProps {
	searchTerm: string;
	setSearchTerm: (term: string) => void;
	hoveredEmoji: FlatEmoji | null;
	inputRef?: React.RefObject<HTMLInputElement | null> | React.RefObject<HTMLInputElement>;
	selectedRow?: number;
	selectedColumn?: number;
	sections?: Array<number>;
	onSelect?: (row: number | null, column: number | null, event?: React.KeyboardEvent) => void;
	onSelectionChange?: (row: number, column: number, shouldScroll?: boolean) => void;
}

export const EmojiPickerSearchBar = observer(
	({
		searchTerm,
		setSearchTerm,
		hoveredEmoji,
		inputRef,
		selectedRow = -1,
		selectedColumn = -1,
		sections = [],
		onSelect,
		onSelectionChange,
	}: EmojiPickerSearchBarProps) => {
		const {i18n} = useLingui();
		const handleKeyDown = useCallback(
			(event: React.KeyboardEvent<HTMLInputElement> | React.KeyboardEvent) => {
				if (isIMEComposing(event)) {
					return;
				}
				if (sections.length === 0) {
					return;
				}
				let newRow = selectedRow;
				let newColumn = selectedColumn;
				switch (event.key) {
					case 'ArrowDown':
						event.preventDefault();
						event.stopPropagation();
						if (newRow === -1) {
							newRow = 0;
							newColumn = 0;
						} else {
							newRow += 1;
							if (newRow >= sections.length) {
								newRow = sections.length - 1;
							}
							if (newColumn >= sections[newRow]) {
								newColumn = sections[newRow] - 1;
							}
						}
						break;
					case 'ArrowUp':
						event.preventDefault();
						event.stopPropagation();
						newRow -= 1;
						if (newRow < 0) {
							newRow = 0;
							newColumn = 0;
						} else if (newColumn >= sections[newRow]) {
							newColumn = sections[newRow] - 1;
						}
						break;
					case 'ArrowLeft':
						event.preventDefault();
						event.stopPropagation();
						if (newRow === -1) {
							newRow = 0;
						}
						newColumn -= 1;
						if (newColumn < 0) {
							newRow -= 1;
							if (newRow >= 0) {
								newColumn = sections[newRow] - 1;
							} else {
								newRow = 0;
								newColumn = 0;
							}
						}
						break;
					case 'ArrowRight':
						event.preventDefault();
						event.stopPropagation();
						if (newRow === -1) {
							newRow = 0;
						}
						newColumn += 1;
						if (newColumn >= sections[newRow]) {
							newRow += 1;
							newColumn = 0;
							if (newRow >= sections.length) {
								newRow = sections.length - 1;
								newColumn = sections[newRow] - 1;
							}
						}
						break;
					case 'Enter':
						event.preventDefault();
						event.stopPropagation();
						if (newRow === -1) {
							newRow = 0;
						}
						if (newColumn === -1) {
							newColumn = 0;
						}
						onSelect?.(newRow, newColumn, event);
						return;
					case 'Escape':
						onSelect?.(null, null);
						return;
					default:
						return;
				}
				onSelectionChange?.(newRow, newColumn, true);
			},
			[sections, selectedRow, selectedColumn, onSelect, onSelectionChange],
		);
		useEffect(() => {
			const handleGlobalKeyDown = (event: Event) => {
				if (sections.length === 0) {
					return;
				}
				const keyboardEvent = event as KeyboardEvent;
				if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(keyboardEvent.key)) {
					return;
				}
				const syntheticEvent = {
					key: keyboardEvent.key,
					shiftKey: keyboardEvent.shiftKey,
					preventDefault: () => keyboardEvent.preventDefault(),
					stopPropagation: () => keyboardEvent.stopPropagation(),
				} as React.KeyboardEvent;
				handleKeyDown(syntheticEvent);
			};
			document.addEventListener('keydown', handleGlobalKeyDown);
			return () => document.removeEventListener('keydown', handleGlobalKeyDown);
		}, [sections, handleKeyDown]);
		const placeholder = hoveredEmoji
			? hoveredEmoji.allNamesString.toString()
			: i18n._(FIND_THE_EMOJI_OF_YOUR_DREAMS_DESCRIPTOR);
		return (
			<div className={styles.container} data-flx="channel.emoji-picker.emoji-picker-search-bar.container">
				<PickerSearchInput
					value={searchTerm}
					onChange={setSearchTerm}
					placeholder={placeholder}
					inputRef={inputRef}
					onKeyDown={handleKeyDown}
					data-flx="channel.emoji-picker.emoji-picker-search-bar.picker-search-input.set-search-term"
				/>
				<SkinToneSelector data-flx="channel.emoji-picker.emoji-picker-search-bar.skin-tone-selector" />
			</div>
		);
	},
);
