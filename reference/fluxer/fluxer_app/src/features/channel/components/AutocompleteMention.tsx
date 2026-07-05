// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	type AutocompleteOption,
	isMentionMember,
	isMentionRole,
	isMentionUser,
	isSpecialMention,
} from '@app/features/channel/components/Autocomplete';
import {AutocompleteItem} from '@app/features/channel/components/AutocompleteItem';
import styles from '@app/features/channel/components/AutocompleteMention.module.css';
import Guilds from '@app/features/guild/state/Guilds';
import {useParams} from '@app/features/platform/components/router/RouterReact';
import * as ColorUtils from '@app/features/theme/utils/ColorUtils';
import {openRoleContextMenu} from '@app/features/ui/action_menu/RoleContextMenu';
import {StatusAwareAvatar} from '@app/features/ui/components/StatusAwareAvatar';
import * as NicknameUtils from '@app/features/user/utils/NicknameUtils';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';

const NOTIFY_EVERYONE_WHO_HAS_PERMISSION_TO_VIEW_THIS_DESCRIPTOR = msg({
	message: 'Notify everyone who has permission to view this channel.',
	comment: 'Description text in the channel and chat autocomplete mention. Keep the tone plain and specific.',
});
const NOTIFY_EVERYONE_ONLINE_WHO_HAS_PERMISSION_TO_VIEW_DESCRIPTOR = msg({
	message: 'Notify everyone online who has permission to view this channel.',
	comment: 'Description text in the channel and chat autocomplete mention. Keep the tone plain and specific.',
});
const NOTIFY_USERS_WITH_THIS_ROLE_WHO_HAVE_PERMISSION_DESCRIPTOR = msg({
	message: 'Notify users with this role who have permission to view this channel.',
	comment: 'Description text in the channel and chat autocomplete mention. Keep the tone plain and specific.',
});
export const AutocompleteMention = observer(function AutocompleteMention({
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
}) {
	const {i18n} = useLingui();
	const {guildId} = useParams() as {guildId?: string};
	const guild = Guilds.getGuild(guildId ?? '');
	const members = options.filter(isMentionMember);
	const users = options.filter(isMentionUser);
	const roles = options.filter(isMentionRole);
	const specialMentions = options.filter(isSpecialMention);
	return (
		<>
			{members.length > 0 && (
				<>
					{members.map((option, index) => (
						<AutocompleteItem
							key={option.member.user.id}
							id={getOptionId?.(index)}
							icon={
								<StatusAwareAvatar
									user={option.member.user}
									size={24}
									guildId={guildId}
									data-flx="channel.autocomplete-mention.status-aware-avatar"
								/>
							}
							name={NicknameUtils.getNickname(option.member.user, guild?.id)}
							description={NicknameUtils.formatUserTagForStreamerMode(option.member.user)}
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
							data-flx="channel.autocomplete-mention.autocomplete-item.select"
						/>
					))}
					{(users.length > 0 || specialMentions.length > 0 || roles.length > 0) && (
						<div className={styles.divider} aria-hidden={true} data-flx="channel.autocomplete-mention.divider" />
					)}
				</>
			)}
			{users.length > 0 && (
				<>
					{users.map((option, index) => {
						const currentIndex = members.length + index;
						return (
							<AutocompleteItem
								key={option.user.id}
								id={getOptionId?.(currentIndex)}
								icon={
									<StatusAwareAvatar
										user={option.user}
										size={24}
										data-flx="channel.autocomplete-mention.status-aware-avatar--2"
									/>
								}
								name={NicknameUtils.getNickname(option.user, guild?.id)}
								description={NicknameUtils.formatUserTagForStreamerMode(option.user)}
								isKeyboardSelected={currentIndex === keyboardFocusIndex}
								isHovered={currentIndex === hoverIndex}
								onSelect={() => onSelect(option)}
								onMouseEnter={() => onMouseEnter(currentIndex)}
								onMouseLeave={onMouseLeave}
								innerRef={
									rowRefs
										? (node) => {
												rowRefs.current[currentIndex] = node;
											}
										: undefined
								}
								data-flx="channel.autocomplete-mention.autocomplete-item.select--2"
							/>
						);
					})}
					{(specialMentions.length > 0 || roles.length > 0) && (
						<div className={styles.divider} aria-hidden={true} data-flx="channel.autocomplete-mention.divider--2" />
					)}
				</>
			)}
			{specialMentions.length > 0 && (
				<>
					{specialMentions.map((option, index) => {
						const currentIndex = members.length + users.length + index;
						return (
							<AutocompleteItem
								key={option.kind}
								id={getOptionId?.(currentIndex)}
								name={option.kind}
								description={
									option.kind === '@everyone'
										? i18n._(NOTIFY_EVERYONE_WHO_HAS_PERMISSION_TO_VIEW_THIS_DESCRIPTOR)
										: i18n._(NOTIFY_EVERYONE_ONLINE_WHO_HAS_PERMISSION_TO_VIEW_DESCRIPTOR)
								}
								isKeyboardSelected={currentIndex === keyboardFocusIndex}
								isHovered={currentIndex === hoverIndex}
								onSelect={() => onSelect(option)}
								onMouseEnter={() => onMouseEnter(currentIndex)}
								onMouseLeave={onMouseLeave}
								innerRef={
									rowRefs
										? (node) => {
												rowRefs.current[currentIndex] = node;
											}
										: undefined
								}
								data-flx="channel.autocomplete-mention.autocomplete-item.select--3"
							/>
						);
					})}
					{roles.length > 0 && (
						<div className={styles.divider} aria-hidden={true} data-flx="channel.autocomplete-mention.divider--3" />
					)}
				</>
			)}
			{roles.length > 0 &&
				roles.map((option, index) => {
					const currentIndex = members.length + users.length + specialMentions.length + index;
					return (
						<AutocompleteItem
							key={option.role.id}
							id={getOptionId?.(currentIndex)}
							name={
								<span
									style={{color: option.role.color ? ColorUtils.int2rgb(option.role.color) : undefined}}
									data-flx="channel.autocomplete-mention.span"
								>
									@{option.role.name}
								</span>
							}
							description={i18n._(NOTIFY_USERS_WITH_THIS_ROLE_WHO_HAVE_PERMISSION_DESCRIPTOR)}
							isKeyboardSelected={currentIndex === keyboardFocusIndex}
							isHovered={currentIndex === hoverIndex}
							onSelect={() => onSelect(option)}
							onMouseEnter={() => onMouseEnter(currentIndex)}
							onMouseLeave={onMouseLeave}
							onContextMenu={(event) => openRoleContextMenu(event, option.role.id)}
							innerRef={
								rowRefs
									? (node) => {
											rowRefs.current[currentIndex] = node;
										}
									: undefined
							}
							data-flx="channel.autocomplete-mention.autocomplete-item.select--4"
						/>
					);
				})}
		</>
	);
});
