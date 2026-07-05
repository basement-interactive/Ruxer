// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	EmojiAttributionSubtext,
	getEmojiAttribution,
} from '@app/features/emoji/components/emojis/EmojiAttributionSubtext';
import styles from '@app/features/emoji/components/emojis/EmojiInfoContent.module.css';
import type {FlatEmoji} from '@app/features/emoji/types/EmojiTypes';
import Guilds from '@app/features/guild/state/Guilds';
import {observer} from 'mobx-react-lite';

interface EmojiInfoContentProps {
	emoji: FlatEmoji;
}

export const EmojiInfoContent = observer(function EmojiInfoContent({emoji}: EmojiInfoContentProps) {
	const guild = emoji.guildId ? Guilds.getGuild(emoji.guildId) : null;
	const attribution = getEmojiAttribution({
		emojiId: emoji.id,
		guildId: emoji.guildId,
		guild,
		emojiName: emoji.name,
	});
	return (
		<EmojiAttributionSubtext
			attribution={attribution}
			classes={{
				container: styles.container,
				text: styles.text,
				guildRow: styles.guildRow,
				guildIcon: styles.guildIcon,
				guildName: styles.guildName,
				verifiedIcon: styles.verifiedIcon,
			}}
			data-flx="emoji.emojis.emoji-info-content.emoji-attribution-subtext"
		/>
	);
});
