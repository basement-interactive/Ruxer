// SPDX-License-Identifier: AGPL-3.0-or-later

import {useAnimatedMediaVideoPlayback} from '@app/features/app/hooks/useAnimatedMediaPlayback';
import {type AutocompleteOption, isMeme} from '@app/features/channel/components/Autocomplete';
import styles from '@app/features/channel/components/AutocompleteEmoji.module.css';
import {AutocompleteItem} from '@app/features/channel/components/AutocompleteItem';
import {MusicNoteIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useRef} from 'react';

const AutocompleteMemeVideo = ({src}: {src: string}) => {
	const videoRef = useRef<HTMLVideoElement>(null);
	const playbackAllowed = useAnimatedMediaVideoPlayback(videoRef);
	return (
		<video
			ref={videoRef}
			src={src}
			className={styles.memeVideo}
			muted
			autoPlay={playbackAllowed}
			loop
			playsInline
			data-flx="channel.autocomplete-meme.meme-video"
		/>
	);
};
export const AutocompleteMeme = observer(
	({
		onSelect,
		keyboardFocusIndex,
		hoverIndex,
		options,
		onMouseEnter,
		onMouseLeave,
		rowRefs,
		getOptionId,
	}: {
		onSelect: (option: AutocompleteOption) => void;
		keyboardFocusIndex: number;
		hoverIndex: number;
		options: Array<AutocompleteOption>;
		onMouseEnter: (index: number) => void;
		onMouseLeave: () => void;
		rowRefs?: React.MutableRefObject<Array<HTMLButtonElement | null>>;
		getOptionId?: (index: number) => string;
	}) => {
		const memes = options.filter(isMeme);
		return memes.map((option, index) => (
			<AutocompleteItem
				key={option.meme.id}
				id={getOptionId?.(index)}
				name={option.meme.name}
				description={option.meme.tags.length > 0 ? option.meme.tags.join(', ') : undefined}
				icon={
					<div className={styles.memeIconWrapper} data-flx="channel.autocomplete-meme.meme-icon-wrapper">
						{option.meme.contentType.startsWith('video/') || option.meme.contentType.includes('gif') ? (
							<AutocompleteMemeVideo
								src={option.meme.url}
								data-flx="channel.autocomplete-meme.autocomplete-meme-video"
							/>
						) : option.meme.contentType.startsWith('audio/') ? (
							<div className={styles.audioIconWrapper} data-flx="channel.autocomplete-meme.audio-icon-wrapper">
								<MusicNoteIcon
									className={styles.audioIcon}
									weight="fill"
									data-flx="channel.autocomplete-meme.audio-icon"
								/>
							</div>
						) : (
							<img
								draggable={false}
								className={styles.memeIcon}
								src={option.meme.url}
								alt={option.meme.name}
								data-flx="channel.autocomplete-meme.meme-icon"
							/>
						)}
					</div>
				}
				isKeyboardSelected={index === keyboardFocusIndex}
				isHovered={index === hoverIndex}
				onSelect={() => onSelect(option)}
				onMouseEnter={() => onMouseEnter(index)}
				onMouseLeave={onMouseLeave}
				innerRef={
					rowRefs
						? (node) => {
								rowRefs.current[index] = node;
							}
						: undefined
				}
				data-flx="channel.autocomplete-meme.autocomplete-item.select"
			/>
		));
	},
);
