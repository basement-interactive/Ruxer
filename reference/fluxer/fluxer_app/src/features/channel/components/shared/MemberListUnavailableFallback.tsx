// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/channel/components/shared/MemberListUnavailableFallback.module.css';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {UsersIcon} from '@phosphor-icons/react';

const YOU_CAN_T_VIEW_MEMBERS_DESCRIPTOR = msg({
	message: "You can't view members",
	comment: 'Error message in the channel and chat member list unavailable fallback.',
});
const MEMBER_LIST_UNAVAILABLE_DESCRIPTOR = msg({
	message: 'Member list unavailable',
	comment: 'Short label in the channel and chat member list unavailable fallback. Keep it concise.',
});
const YOU_DON_T_HAVE_PERMISSION_TO_VIEW_THE_DESCRIPTOR = msg({
	message: "You can't view the members of this channel in this community",
	comment:
		'Description text in the channel and chat member list unavailable fallback. Keep the tone plain and specific.',
});
const MEMBER_LISTS_ARE_TEMPORARILY_UNAVAILABLE_IN_THIS_COMMUNITY_DESCRIPTOR = msg({
	message: 'Member lists are temporarily unavailable in this community',
	comment: 'Label in the channel and chat member list unavailable fallback.',
});

type MemberListUnavailableVariant = 'unavailable' | 'permission_denied';

interface MemberListUnavailableFallbackProps {
	className?: string;
	variant?: MemberListUnavailableVariant;
}

export function MemberListUnavailableFallback({
	className,
	variant = 'unavailable',
}: MemberListUnavailableFallbackProps) {
	const {i18n} = useLingui();
	const containerClassName = className ? `${styles.container} ${className}` : styles.container;
	const title =
		variant === 'permission_denied'
			? i18n._(YOU_CAN_T_VIEW_MEMBERS_DESCRIPTOR)
			: i18n._(MEMBER_LIST_UNAVAILABLE_DESCRIPTOR);
	const description =
		variant === 'permission_denied'
			? i18n._(YOU_DON_T_HAVE_PERMISSION_TO_VIEW_THE_DESCRIPTOR)
			: i18n._(MEMBER_LISTS_ARE_TEMPORARILY_UNAVAILABLE_IN_THIS_COMMUNITY_DESCRIPTOR);
	return (
		<div className={containerClassName} data-flx="channel.member-list-unavailable-fallback.div">
			<div className={styles.content} data-flx="channel.member-list-unavailable-fallback.content">
				<UsersIcon className={styles.icon} weight="fill" data-flx="channel.member-list-unavailable-fallback.icon" />
				<h3 className={styles.title} data-flx="channel.member-list-unavailable-fallback.title">
					{title}
				</h3>
				<p className={styles.description} data-flx="channel.member-list-unavailable-fallback.description">
					{description}
				</p>
			</div>
		</div>
	);
}
