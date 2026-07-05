// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/channel/components/EmojiPicker.module.css';
import type {GuildSticker} from '@app/features/expressions/models/GuildSticker';
import {GuildIcon} from '@app/features/guild/components/popouts/GuildIcon';
import Guilds from '@app/features/guild/state/Guilds';
import {Scroller} from '@app/features/ui/components/Scroller';
import {Tooltip} from '@app/features/ui/tooltip/Tooltip';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';

interface StickerPickerCategoryListProps {
	stickersByGuildId: ReadonlyMap<string, ReadonlyArray<GuildSticker>>;
	handleCategoryClick: (category: string) => void;
	horizontal?: boolean;
}

export const StickerPickerCategoryList = observer(
	({stickersByGuildId, handleCategoryClick, horizontal = false}: StickerPickerCategoryListProps) => {
		if (horizontal) {
			return (
				<div
					className={styles.horizontalCategories}
					data-flx="channel.sticker-picker.sticker-picker-category-list.horizontal-categories"
				>
					{Array.from(stickersByGuildId.keys()).map((guildId) => {
						const guild = Guilds.getGuild(guildId)!;
						return (
							<button
								key={guild.id}
								type="button"
								onClick={() => handleCategoryClick(guild.id)}
								className={clsx(styles.categoryListIcon, styles.textPrimaryMuted)}
								aria-label={guild.name}
								data-flx="channel.sticker-picker.sticker-picker-category-list.category-list-icon.category-click.button"
							>
								<GuildIcon
									id={guild.id}
									name={guild.name}
									icon={guild.icon}
									className={styles.iconSize}
									sizePx={24}
									data-flx="channel.sticker-picker.sticker-picker-category-list.icon-size"
								/>
							</button>
						);
					})}
				</div>
			);
		}
		return (
			<div className={styles.categoryList} data-flx="channel.sticker-picker.sticker-picker-category-list.category-list">
				<Scroller
					className={styles.categoryListScroll}
					key="sticker-picker-category-list-scroller"
					fade={false}
					showTrack={false}
					data-flx="channel.sticker-picker.sticker-picker-category-list.category-list-scroll"
				>
					<div className={styles.listItems} data-flx="channel.sticker-picker.sticker-picker-category-list.list-items">
						{Array.from(stickersByGuildId.keys()).map((guildId) => {
							const guild = Guilds.getGuild(guildId)!;
							return (
								<Tooltip
									key={guild.id}
									text={guild.name}
									position="left"
									data-flx="channel.sticker-picker.sticker-picker-category-list.tooltip"
								>
									<button
										type="button"
										onClick={() => handleCategoryClick(guild.id)}
										className={clsx(styles.categoryListIcon, styles.textPrimaryMuted)}
										data-flx="channel.sticker-picker.sticker-picker-category-list.category-list-icon.category-click.button--2"
									>
										<GuildIcon
											id={guild.id}
											name={guild.name}
											icon={guild.icon}
											className={styles.iconSize}
											sizePx={24}
											data-flx="channel.sticker-picker.sticker-picker-category-list.icon-size--2"
										/>
									</button>
								</Tooltip>
							);
						})}
					</div>
				</Scroller>
			</div>
		);
	},
);
