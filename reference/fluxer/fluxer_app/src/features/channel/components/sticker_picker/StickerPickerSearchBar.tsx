// SPDX-License-Identifier: AGPL-3.0-or-later

import {PickerSearchInput} from '@app/features/channel/components/shared/PickerSearchInput';
import type {GuildSticker} from '@app/features/expressions/models/GuildSticker';
import {isIMEComposing} from '@app/features/messaging/utils/IMECompositionUtils';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback, useEffect} from 'react';

const FIND_THE_PERFECT_STICKER_DESCRIPTOR = msg({
	message: 'Find the perfect sticker',
	comment: 'Label in the channel and chat sticker picker search bar.',
});

interface StickerPickerSearchBarProps {
	searchTerm: string;
	setSearchTerm: (term: string) => void;
	hoveredSticker: GuildSticker | null;
	inputRef?: React.RefObject<HTMLInputElement | null> | React.RefObject<HTMLInputElement>;
	selectedRow?: number;
	selectedColumn?: number;
	sections?: Array<number>;
	onSelect?: (row: number | null, column: number | null, event?: React.KeyboardEvent) => void;
	onSelectionChange?: (row: number, column: number, shouldScroll?: boolean) => void;
}

export const StickerPickerSearchBar = observer(
	({
		searchTerm,
		setSearchTerm,
		hoveredSticker,
		inputRef,
		selectedRow = -1,
		selectedColumn = -1,
		sections = [],
		onSelect,
		onSelectionChange,
	}: StickerPickerSearchBarProps) => {
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
		const placeholder = hoveredSticker ? hoveredSticker.name : i18n._(FIND_THE_PERFECT_STICKER_DESCRIPTOR);
		return (
			<PickerSearchInput
				value={searchTerm}
				onChange={setSearchTerm}
				placeholder={placeholder}
				inputRef={inputRef}
				onKeyDown={handleKeyDown}
				data-flx="channel.sticker-picker.sticker-picker-search-bar.picker-search-input.set-search-term"
			/>
		);
	},
);
