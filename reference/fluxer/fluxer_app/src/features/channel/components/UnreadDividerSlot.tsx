// SPDX-License-Identifier: AGPL-3.0-or-later

import dividerStyles from '@app/features/channel/components/ChannelDivider.module.css';
import styles from '@app/features/channel/components/ChannelMessages.module.css';
import {Trans} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';

type UnreadDividerSlotProps =
	| {beforeId: string; afterId?: never; visible: boolean}
	| {afterId: string; beforeId?: never; visible: boolean};

export const UnreadDividerSlot = observer(function UnreadDividerSlot(props: UnreadDividerSlotProps) {
	const dataAttributes = {
		'data-divider-slot': 'unread',
		'data-before-id': 'beforeId' in props && props.beforeId !== undefined ? props.beforeId : undefined,
		'data-after-id': 'afterId' in props && props.afterId !== undefined ? props.afterId : undefined,
	} as const;
	return (
		<div
			className={styles.unreadSlot}
			aria-hidden="true"
			id={props.visible ? 'new-messages-bar' : undefined}
			data-visible={props.visible ? '1' : undefined}
			data-flx="channel.unread-divider-slot.unread-slot"
			{...dataAttributes}
		>
			<div className={dividerStyles.unreadContainer} data-flx="channel.unread-divider-slot.div">
				<div className={dividerStyles.unreadLine} data-flx="channel.unread-divider-slot.div--2" />
				<span className={dividerStyles.unreadBadge} data-flx="channel.unread-divider-slot.span">
					<Trans>New</Trans>
				</span>
			</div>
		</div>
	);
});
