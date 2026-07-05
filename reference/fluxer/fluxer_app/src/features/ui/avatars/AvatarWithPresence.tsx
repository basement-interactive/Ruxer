// SPDX-License-Identifier: AGPL-3.0-or-later

import GuildMembers from '@app/features/member/state/GuildMembers';
import styles from '@app/features/ui/avatars/AvatarWithPresence.module.css';
import {BaseAvatar} from '@app/features/ui/components/BaseAvatar';
import type {User} from '@app/features/user/models/User';
import * as AvatarUtils from '@app/features/user/utils/AvatarUtils';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {MicrophoneSlashIcon, SpeakerSlashIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import type React from 'react';

const MUTED_VOICE_BADGE_LABEL = msg({
	message: 'Muted',
	comment: 'Accessible label for the muted voice badge shown on an avatar.',
});
const DEAFENED_VOICE_BADGE_LABEL = msg({
	message: 'Deafened',
	comment: 'Accessible label for the deafened voice badge shown on an avatar.',
});

interface Props {
	user: User;
	size: number;
	speaking?: boolean;
	muted?: boolean;
	deafened?: boolean;
	className?: string;
	ariaLabel?: string;
	borderClassName?: string;
	guildId?: string | null;
	title?: never;
}

export const AvatarWithPresence: React.FC<Props> = observer(function AvatarWithPresence({
	user,
	size,
	speaking,
	muted,
	deafened,
	className,
	ariaLabel,
	borderClassName,
	guildId,
}) {
	const {i18n} = useLingui();
	const guildMember = GuildMembers.getMember(guildId || '', user.id);
	const animated = speaking ?? false;
	const src =
		guildId && guildMember
			? AvatarUtils.getGuildMemberDisplayAvatarURL({
					guildId,
					user,
					memberAvatar: guildMember.avatar,
					avatarUnset: guildMember.isAvatarUnset(),
					animated,
				})
			: AvatarUtils.getUserAvatarURL(user, animated);
	const voiceBadge = deafened ? (
		<SpeakerSlashIcon
			weight="fill"
			aria-hidden
			className={styles.voiceIndicatorIcon}
			data-flx="ui.avatars.avatar-with-presence.voice-indicator-icon"
		/>
	) : muted ? (
		<MicrophoneSlashIcon
			weight="fill"
			aria-hidden
			className={styles.voiceIndicatorIcon}
			data-flx="ui.avatars.avatar-with-presence.voice-indicator-icon--2"
		/>
	) : null;
	const voiceBadgeLabel = deafened
		? i18n._(DEAFENED_VOICE_BADGE_LABEL)
		: muted
			? i18n._(MUTED_VOICE_BADGE_LABEL)
			: null;
	return (
		<BaseAvatar
			size={size}
			avatarUrl={src}
			className={clsx(styles.container, speaking && styles.containerSpeaking, borderClassName, className)}
			userTag={ariaLabel ?? user.displayName}
			disableStatusTooltip
			customStatusBadge={voiceBadge}
			customStatusBadgeColor="var(--status-danger)"
			customStatusBadgeLabel={voiceBadgeLabel}
			customStatusBadgeMaskId="svg-mask-status-online"
			customStatusBadgeScale={1.5}
			customStatusBadgeMaxSizeRatio={0.36}
			customStatusBadgeCutoutPaddingScale={1.35}
			data-flx="ui.avatars.avatar-with-presence.container"
		/>
	);
});
