// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/channel/components/QuickReactionsRow.module.css';
import type {FlatEmoji} from '@app/features/emoji/types/EmojiTypes';
import {getEmojiDisplayData} from '@app/features/expressions/utils/SkinToneUtils';
import {ReactionImage} from '@app/features/messaging/components/ReactionImage';
import * as AvatarUtils from '@app/features/user/utils/AvatarUtils';
import {msg} from '@lingui/core/macro';
import type React from 'react';

export const REACT_WITH_EMOJI_DESCRIPTOR = msg({
	message: 'React with {emojiShortcode}',
	comment:
		'Accessible label for a quick reaction emoji button. Preserve {emojiShortcode}; it is inserted by code, usually like :smile:.',
});

export function getQuickReactionEmojiSrc(emoji: FlatEmoji): string {
	const {url: displayUrl} = getEmojiDisplayData(emoji);
	return emoji.id ? AvatarUtils.getEmojiURL({id: emoji.id, animated: false}) : (displayUrl ?? '');
}

export function renderQuickReactionEmoji(emoji: FlatEmoji): React.ReactNode {
	const emojiSrc = getQuickReactionEmojiSrc(emoji);
	return (
		<ReactionImage
			src={emojiSrc}
			alt={emoji.name}
			draggable={false}
			className={styles.emojiImg}
			data-flx="channel.quick-reactions-row.render-quick-reaction-emoji.emoji-img"
		/>
	);
}
