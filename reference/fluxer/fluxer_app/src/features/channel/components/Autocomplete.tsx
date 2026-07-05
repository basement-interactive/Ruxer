// SPDX-License-Identifier: AGPL-3.0-or-later

import {useListNavigation} from '@app/features/app/hooks/useListNavigation';
import styles from '@app/features/channel/components/Autocomplete.module.css';
import {AutocompleteChannel} from '@app/features/channel/components/AutocompleteChannel';
import {AutocompleteCommand} from '@app/features/channel/components/AutocompleteCommand';
import {AutocompleteEmoji} from '@app/features/channel/components/AutocompleteEmoji';
import {AutocompleteGif} from '@app/features/channel/components/AutocompleteGif';
import {AutocompleteMeme} from '@app/features/channel/components/AutocompleteMeme';
import {AutocompleteMention} from '@app/features/channel/components/AutocompleteMention';
import {AutocompleteSticker} from '@app/features/channel/components/AutocompleteSticker';
import type {Channel} from '@app/features/channel/models/Channel';
import type {Command} from '@app/features/devtools/hooks/useCommands';
import type {FlatEmoji} from '@app/features/emoji/types/EmojiTypes';
import type {Gif} from '@app/features/expressions/commands/GifCommands';
import type {FavoriteMeme} from '@app/features/expressions/models/FavoriteMeme';
import type {GuildSticker} from '@app/features/expressions/models/GuildSticker';
import type {GuildRole} from '@app/features/guild/models/GuildRole';
import type {GuildMember} from '@app/features/member/models/GuildMember';
import {isIMEComposing} from '@app/features/messaging/utils/IMECompositionUtils';
import {Scroller, type ScrollerHandle} from '@app/features/ui/components/Scroller';
import {usePortalHost} from '@app/features/ui/overlay/PortalHostContext';
import type {User} from '@app/features/user/models/User';
import {autoUpdate, FloatingPortal, flip, offset, size, useFloating} from '@floating-ui/react';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback, useEffect, useId, useRef, useState} from 'react';

const SUGGESTIONS_DESCRIPTOR = msg({
	message: 'Suggestions',
	comment: 'Short label in the channel and chat autocomplete. Keep it concise.',
});

type ScrollerWithScrollableElement = ScrollerHandle & {
	getScrollableElement?: () => HTMLElement | null;
};
export type AutocompleteOption =
	| {type: 'mention'; kind: 'member'; member: GuildMember}
	| {type: 'mention'; kind: 'user'; user: User}
	| {type: 'mention'; kind: 'role'; role: GuildRole}
	| {type: 'mention'; kind: '@everyone' | '@here'}
	| {type: 'channel'; channel: Channel}
	| {type: 'emoji'; emoji: FlatEmoji}
	| {type: 'command'; command: Command}
	| {type: 'meme'; meme: FavoriteMeme}
	| {type: 'gif'; gif: Gif}
	| {type: 'sticker'; sticker: GuildSticker};
export type AutocompleteType = 'mention' | 'channel' | 'emoji' | 'command' | 'meme' | 'gif' | 'sticker';

export function getAutocompleteOptionId(listboxId: string, index: number): string {
	return `${listboxId}-option-${index}`;
}

export const isMentionMember = (o: AutocompleteOption): o is {type: 'mention'; kind: 'member'; member: GuildMember} =>
	o.type === 'mention' && o.kind === 'member';
export const isMentionUser = (o: AutocompleteOption): o is {type: 'mention'; kind: 'user'; user: User} =>
	o.type === 'mention' && o.kind === 'user';
export const isMentionRole = (o: AutocompleteOption): o is {type: 'mention'; kind: 'role'; role: GuildRole} =>
	o.type === 'mention' && o.kind === 'role';
export const isSpecialMention = (o: AutocompleteOption): o is {type: 'mention'; kind: '@everyone' | '@here'} =>
	o.type === 'mention' && (o.kind === '@everyone' || o.kind === '@here');
export const isChannel = (o: AutocompleteOption): o is {type: 'channel'; channel: Channel} => o.type === 'channel';
export const isEmoji = (o: AutocompleteOption): o is {type: 'emoji'; emoji: FlatEmoji} => o.type === 'emoji';
export const isCommand = (o: AutocompleteOption): o is {type: 'command'; command: Command} => o.type === 'command';
export const isMeme = (o: AutocompleteOption): o is {type: 'meme'; meme: FavoriteMeme} => o.type === 'meme';
export const isGif = (o: AutocompleteOption): o is {type: 'gif'; gif: Gif} => o.type === 'gif';
export const isSticker = (o: AutocompleteOption): o is {type: 'sticker'; sticker: GuildSticker} => o.type === 'sticker';
export const Autocomplete = observer(
	({
		type,
		onSelect,
		selectedIndex: externalSelectedIndex,
		options,
		setSelectedIndex: externalSetSelectedIndex,
		referenceElement,
		zIndex,
		attached = false,
		listboxId,
	}: {
		type: AutocompleteType;
		onSelect: (option: AutocompleteOption) => void;
		selectedIndex?: number;
		options: Array<AutocompleteOption>;
		setSelectedIndex?: React.Dispatch<React.SetStateAction<number>>;
		referenceElement?: HTMLElement | null;
		zIndex?: number;
		query?: string;
		attached?: boolean;
		listboxId?: string;
	}) => {
		const {i18n} = useLingui();
		const generatedListboxId = useId();
		const resolvedListboxId = listboxId ?? generatedListboxId;
		const getOptionId = useCallback(
			(index: number) => getAutocompleteOptionId(resolvedListboxId, index),
			[resolvedListboxId],
		);
		const {
			keyboardFocusIndex: internalKeyboardFocusIndex,
			hoverIndexForRender,
			handleKeyboardNavigation,
			handleMouseEnter,
			handleMouseLeave,
			reset,
		} = useListNavigation({
			itemCount: options.length,
			initialIndex: 0,
			loop: true,
		});
		const keyboardFocusIndex = externalSelectedIndex ?? internalKeyboardFocusIndex;
		const [referenceState, setReferenceState] = useState<HTMLElement | null>(referenceElement ?? null);
		useEffect(() => {
			setReferenceState(referenceElement ?? null);
		}, [referenceElement]);
		const portalHost = usePortalHost();
		const {refs, floatingStyles} = useFloating({
			placement: 'top-start',
			open: true,
			whileElementsMounted: autoUpdate,
			elements: {reference: referenceState},
			middleware: [
				offset(attached ? 0 : 8),
				flip({padding: 16}),
				size({
					apply({rects, elements}) {
						Object.assign(elements.floating.style, {
							width: `${rects.reference.width}px`,
						});
					},
					padding: 16,
				}),
			],
		});
		const scrollerRef = useRef<ScrollerHandle>(null);
		const rowRefs = useRef<Array<HTMLButtonElement | null>>([]);
		if (rowRefs.current.length !== options.length) {
			rowRefs.current = Array(options.length).fill(null);
		}
		useEffect(() => {
			reset();
		}, [options.length, reset]);
		const handleKeyDown = useCallback(
			(event: React.KeyboardEvent) => {
				if (isIMEComposing(event)) {
					return;
				}
				switch (event.key) {
					case 'ArrowDown': {
						event.preventDefault();
						handleKeyboardNavigation('down');
						if (externalSetSelectedIndex) {
							externalSetSelectedIndex((prev) => (prev + 1 >= options.length ? 0 : prev + 1));
						}
						break;
					}
					case 'Home': {
						event.preventDefault();
						handleKeyboardNavigation('home');
						if (externalSetSelectedIndex) {
							externalSetSelectedIndex(0);
						}
						break;
					}
					case 'End': {
						event.preventDefault();
						handleKeyboardNavigation('end');
						if (externalSetSelectedIndex) {
							externalSetSelectedIndex(Math.max(0, options.length - 1));
						}
						break;
					}
					case 'ArrowUp': {
						event.preventDefault();
						handleKeyboardNavigation('up');
						if (externalSetSelectedIndex) {
							externalSetSelectedIndex((prev) => (prev - 1 < 0 ? options.length - 1 : prev - 1));
						}
						break;
					}
					case 'Tab':
					case 'Enter': {
						if (event.key === 'Tab' && event.shiftKey) {
							break;
						}
						event.preventDefault();
						if (keyboardFocusIndex >= 0 && keyboardFocusIndex < options.length) {
							onSelect(options[keyboardFocusIndex]);
						}
						break;
					}
					default:
						break;
				}
			},
			[externalSetSelectedIndex, handleKeyboardNavigation, keyboardFocusIndex, onSelect, options],
		);
		const scrollChildIntoView = useCallback((node: HTMLElement | null, margin = 32) => {
			if (!node) return;
			const scroller = scrollerRef.current as ScrollerWithScrollableElement | null;
			if (scroller && typeof scroller.scrollIntoViewNode === 'function') {
				scroller.scrollIntoViewNode({node, padding: margin});
				return;
			}
			const scrollerEl =
				scroller?.getScrollableElement?.() ||
				node.closest('[data-scrollable], .overflow-y-auto, .overflow-y-scroll') ||
				node.parentElement;
			if (scrollerEl && scrollerEl instanceof HTMLElement) {
				const sRect = scrollerEl.getBoundingClientRect();
				const nRect = node.getBoundingClientRect();
				const outOfViewTop = nRect.top < sRect.top + margin;
				const outOfViewBottom = nRect.bottom > sRect.bottom - margin;
				if (outOfViewTop) {
					scrollerEl.scrollTop -= sRect.top + margin - nRect.top;
				} else if (outOfViewBottom) {
					scrollerEl.scrollTop += nRect.bottom - (sRect.bottom - margin);
				}
				return;
			}
			node.scrollIntoView({block: 'nearest'});
		}, []);
		useEffect(() => {
			const node = rowRefs.current[keyboardFocusIndex] ?? null;
			if (!node) return;
			const raf = requestAnimationFrame(() => scrollChildIntoView(node, 32));
			return () => cancelAnimationFrame(raf);
		}, [keyboardFocusIndex, options.length, scrollChildIntoView]);
		return (
			<FloatingPortal root={portalHost ?? undefined} data-flx="channel.autocomplete.floating-portal">
				<div
					ref={refs.setFloating}
					style={{...floatingStyles, zIndex: zIndex ?? undefined}}
					className={`${styles.container} ${attached ? styles.containerAttached : styles.containerDetached}`}
					onKeyDown={handleKeyDown}
					role="listbox"
					id={resolvedListboxId}
					aria-label={i18n._(SUGGESTIONS_DESCRIPTOR)}
					data-flx="channel.autocomplete.container.key-down"
				>
					{type === 'gif' ? (
						<AutocompleteGif
							onSelect={onSelect}
							keyboardFocusIndex={keyboardFocusIndex}
							hoverIndex={hoverIndexForRender}
							options={options}
							onMouseEnter={handleMouseEnter}
							onMouseLeave={handleMouseLeave}
							rowRefs={rowRefs}
							getOptionId={getOptionId}
							data-flx="channel.autocomplete.autocomplete-gif.select"
						/>
					) : (
						<Scroller
							ref={scrollerRef}
							className={styles.scroller}
							key="autocomplete-scroller"
							data-flx="channel.autocomplete.scroller"
						>
							{type === 'mention' ? (
								<AutocompleteMention
									onSelect={onSelect}
									keyboardFocusIndex={keyboardFocusIndex}
									hoverIndex={hoverIndexForRender}
									options={options}
									onMouseEnter={handleMouseEnter}
									onMouseLeave={handleMouseLeave}
									rowRefs={rowRefs}
									getOptionId={getOptionId}
									data-flx="channel.autocomplete.autocomplete-mention.select"
								/>
							) : type === 'channel' ? (
								<AutocompleteChannel
									onSelect={onSelect}
									keyboardFocusIndex={keyboardFocusIndex}
									hoverIndex={hoverIndexForRender}
									options={options}
									onMouseEnter={handleMouseEnter}
									onMouseLeave={handleMouseLeave}
									rowRefs={rowRefs}
									getOptionId={getOptionId}
									data-flx="channel.autocomplete.autocomplete-channel.select"
								/>
							) : type === 'command' ? (
								<AutocompleteCommand
									onSelect={onSelect}
									keyboardFocusIndex={keyboardFocusIndex}
									hoverIndex={hoverIndexForRender}
									options={options}
									onMouseEnter={handleMouseEnter}
									onMouseLeave={handleMouseLeave}
									rowRefs={rowRefs}
									getOptionId={getOptionId}
									data-flx="channel.autocomplete.autocomplete-command.select"
								/>
							) : type === 'meme' ? (
								<AutocompleteMeme
									onSelect={onSelect}
									keyboardFocusIndex={keyboardFocusIndex}
									hoverIndex={hoverIndexForRender}
									options={options}
									onMouseEnter={handleMouseEnter}
									onMouseLeave={handleMouseLeave}
									rowRefs={rowRefs}
									getOptionId={getOptionId}
									data-flx="channel.autocomplete.autocomplete-meme.select"
								/>
							) : type === 'sticker' ? (
								<AutocompleteSticker
									onSelect={onSelect}
									keyboardFocusIndex={keyboardFocusIndex}
									hoverIndex={hoverIndexForRender}
									options={options}
									onMouseEnter={handleMouseEnter}
									onMouseLeave={handleMouseLeave}
									rowRefs={rowRefs}
									getOptionId={getOptionId}
									data-flx="channel.autocomplete.autocomplete-sticker.select"
								/>
							) : (
								<AutocompleteEmoji
									onSelect={onSelect}
									keyboardFocusIndex={keyboardFocusIndex}
									hoverIndex={hoverIndexForRender}
									options={options}
									onMouseEnter={handleMouseEnter}
									onMouseLeave={handleMouseLeave}
									rowRefs={rowRefs}
									getOptionId={getOptionId}
									data-flx="channel.autocomplete.autocomplete-emoji.select"
								/>
							)}
						</Scroller>
					)}
				</div>
			</FloatingPortal>
		);
	},
);
