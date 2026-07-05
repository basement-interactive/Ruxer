// SPDX-License-Identifier: AGPL-3.0-or-later

import Presence from '@app/features/presence/state/Presence';
import TransientPresence from '@app/features/presence/state/TransientPresence';
import {Avatar} from '@app/features/ui/components/Avatar';
import type {User} from '@app/features/user/models/User';
import type {MediaProxyImageSize} from '@fluxer/constants/src/MediaProxyImageSizes';
import type {StatusType} from '@fluxer/constants/src/StatusConstants';
import {StatusTypes} from '@fluxer/constants/src/StatusConstants';
import {reaction} from 'mobx';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useEffect, useState} from 'react';

export interface StatusAwareAvatarProps {
	user: User | null;
	size: number;
	forceAnimate?: boolean;
	forceAnimateIgnoringSettings?: boolean;
	isTyping?: boolean;
	showOffline?: boolean;
	className?: string;
	isClickable?: boolean;
	disablePresence?: boolean;
	disableStatusTooltip?: boolean;
	avatarUrl?: string | null;
	hoverAvatarUrl?: string | null;
	guildId?: string | null;
	mediaSize?: MediaProxyImageSize;
	deferImageLoad?: boolean;
	status?: string | null;
	animateStatusCutout?: boolean;
}

function getStatusWithTransientFallback(userId: string): StatusType {
	const presenceStatus = Presence.getStatus(userId);
	if (presenceStatus !== StatusTypes.OFFLINE) {
		return presenceStatus;
	}
	return TransientPresence.getStatus(userId);
}

export const StatusAwareAvatar: React.FC<StatusAwareAvatarProps> = observer(
	({
		user,
		size,
		forceAnimate,
		forceAnimateIgnoringSettings,
		isTyping,
		showOffline,
		className,
		isClickable,
		disablePresence,
		disableStatusTooltip = false,
		avatarUrl,
		hoverAvatarUrl,
		guildId,
		mediaSize,
		deferImageLoad,
		status: externalStatus,
		animateStatusCutout,
	}) => {
		const [internalStatus, setInternalStatus] = useState<string | null>(() =>
			disablePresence || !user ? null : getStatusWithTransientFallback(user.id),
		);
		const [isMobile, setIsMobile] = useState<boolean>(() =>
			disablePresence || !user ? false : Presence.isMobile(user.id),
		);
		const status = externalStatus ?? internalStatus;
		useEffect(() => {
			if (disablePresence || !user || externalStatus !== undefined) {
				return;
			}
			setInternalStatus(getStatusWithTransientFallback(user.id));
			setIsMobile(Presence.isMobile(user.id));
			const unsubscribePresence = Presence.subscribeToUserStatus(user.id, (_, newStatus, newIsMobile) => {
				if (newStatus !== StatusTypes.OFFLINE) {
					setInternalStatus(newStatus);
				} else {
					setInternalStatus(getStatusWithTransientFallback(user.id));
				}
				setIsMobile(newIsMobile);
			});
			const disposeTransient = reaction(
				() => TransientPresence.getTransientStatus(user.id),
				() => {
					const presenceStatus = Presence.getStatus(user.id);
					if (presenceStatus === StatusTypes.OFFLINE) {
						setInternalStatus(getStatusWithTransientFallback(user.id));
					}
				},
			);
			return () => {
				unsubscribePresence();
				disposeTransient();
			};
		}, [user?.id, disablePresence, user, externalStatus]);
		if (!user) {
			return null;
		}
		const shouldDisablePresence = disablePresence || user.system;
		return (
			<Avatar
				user={user}
				size={size}
				status={shouldDisablePresence ? null : status}
				isMobileStatus={shouldDisablePresence ? false : isMobile}
				forceAnimate={forceAnimate}
				forceAnimateIgnoringSettings={forceAnimateIgnoringSettings}
				isTyping={isTyping}
				showOffline={showOffline}
				className={className}
				isClickable={isClickable}
				disableStatusTooltip={disableStatusTooltip}
				avatarUrl={avatarUrl}
				hoverAvatarUrl={hoverAvatarUrl}
				guildId={guildId}
				mediaSize={mediaSize}
				deferImageLoad={deferImageLoad}
				animateStatusCutout={animateStatusCutout}
				data-flx="ui.status-aware-avatar.avatar"
			/>
		);
	},
);

export type ListStatusAwareAvatarProps = Omit<StatusAwareAvatarProps, 'animateStatusCutout'>;

export const ListStatusAwareAvatar: React.FC<ListStatusAwareAvatarProps> = (props) => (
	<StatusAwareAvatar
		data-flx="ui.status-aware-avatar.list-status-aware-avatar.status-aware-avatar"
		{...props}
		animateStatusCutout
	/>
);
