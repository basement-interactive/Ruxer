// SPDX-License-Identifier: AGPL-3.0-or-later

import {getAnimatedMediaPlaybackAllowed} from '@app/features/app/hooks/useAnimatedMediaPlayback';
import Emoji from '@app/features/emoji/state/Emoji';
import type {FlatEmoji} from '@app/features/emoji/types/EmojiTypes';
import * as EmojiUtils from '@app/features/expressions/utils/EmojiUtils';
import {EmojiKind} from '@app/features/messaging/utils/markdown/parser/Enums';
import type {EmojiNode} from '@app/features/messaging/utils/markdown/parser/Nodes';
import UserSettings from '@app/features/user/state/UserSettings';
import * as AvatarUtils from '@app/features/user/utils/AvatarUtils';

interface EmojiRenderData {
	url: string | null;
	name: string;
	isAnimated: boolean;
	id?: string;
	emoji?: FlatEmoji;
}

export function getEmojiRenderData(emojiNode: EmojiNode, disableAnimatedEmoji = false): EmojiRenderData {
	const {kind} = emojiNode;
	const emojiName = `:${kind.name}:`;
	if (kind.kind === EmojiKind.Standard) {
		return {
			url: EmojiUtils.getTwemojiURL(kind.codepoints),
			name: emojiName,
			isAnimated: false,
		};
	}
	const {id} = kind;
	const emoji = Emoji.getEmojiById(id);
	const isAnimated = emoji?.animated ?? kind.animated;
	const shouldAnimate =
		isAnimated && !disableAnimatedEmoji && UserSettings.getAnimateEmoji() && getAnimatedMediaPlaybackAllowed();
	const finalEmojiName = `:${emoji?.name || kind.name}:`;
	return {
		url: AvatarUtils.getEmojiURL({id, animated: shouldAnimate}),
		name: finalEmojiName,
		isAnimated,
		id,
		emoji,
	};
}
