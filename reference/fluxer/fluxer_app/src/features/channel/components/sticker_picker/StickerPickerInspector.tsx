// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/channel/components/EmojiPicker.module.css';
import type {GuildSticker} from '@app/features/expressions/models/GuildSticker';
import {observer} from 'mobx-react-lite';
import type React from 'react';

interface StickerPickerInspectorProps {
	hoveredSticker: GuildSticker | null;
	style?: React.CSSProperties;
}

export const StickerPickerInspector = observer(({hoveredSticker, style}: StickerPickerInspectorProps) => {
	return (
		<div
			className={styles.inspector}
			style={style}
			data-flx="channel.sticker-picker.sticker-picker-inspector.inspector"
		>
			{hoveredSticker && (
				<>
					<img
						src={hoveredSticker.url}
						alt={hoveredSticker.name}
						className={styles.inspectorEmoji}
						data-flx="channel.sticker-picker.sticker-picker-inspector.inspector-emoji"
					/>
					<span
						className={styles.inspectorText}
						data-flx="channel.sticker-picker.sticker-picker-inspector.inspector-text"
					>
						{hoveredSticker.name}
					</span>
				</>
			)}
		</div>
	);
});
