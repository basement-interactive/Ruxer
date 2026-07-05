// SPDX-License-Identifier: AGPL-3.0-or-later

import Guilds from '@app/features/guild/state/Guilds';
import Permission from '@app/features/permissions/state/Permission';
import {DataMenuRenderer} from '@app/features/ui/action_menu/DataMenuRenderer';
import {ManageRolesMenuItem} from '@app/features/ui/action_menu/items/GuildMemberMenuItems';
import {MoveToChannelSubmenu} from '@app/features/ui/action_menu/items/MoveToChannelSubmenu';
import {useVoiceParticipantMenuData} from '@app/features/ui/action_menu/items/VoiceParticipantMenuData';
import {MenuGroup} from '@app/features/ui/action_menu/MenuGroup';
import type {User} from '@app/features/user/models/User';
import {Permissions} from '@fluxer/constants/src/ChannelConstants';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useMemo} from 'react';

const MOVE_DEVICE_TO_DESCRIPTOR = msg({
	message: 'Move device to…',
	comment: 'Submenu label that moves a single device into another voice channel.',
});
const MOVE_ALL_DEVICES_TO_DESCRIPTOR = msg({
	message: 'Move all devices to…',
	comment: 'Submenu label that moves every active device into another voice channel.',
});
const MOVE_TO_DESCRIPTOR = msg({
	message: 'Move to…',
	comment: 'Submenu label that moves the selected participant or content into another channel.',
});

interface VoiceParticipantContextMenuProps {
	user: User;
	participantName: string;
	onClose: () => void;
	guildId?: string;
	connectionId?: string;
	isGroupedItem?: boolean;
	isParentGroupedItem?: boolean;
	streamKey?: string;
	isScreenShare?: boolean;
	isWatching?: boolean;
	hasScreenShareAudio?: boolean;
	isOwnScreenShare?: boolean;
	onStopWatching?: () => void;
	hiddenConnectionCount?: number;
	deviceConnectionCount?: number;
	isDeviceGroupExpanded?: boolean;
	onToggleDeviceGroup?: () => void;
}

export const VoiceParticipantContextMenu: React.FC<VoiceParticipantContextMenuProps> = observer(
	({
		user,
		onClose,
		guildId,
		connectionId,
		isGroupedItem = false,
		isParentGroupedItem = false,
		streamKey,
		isScreenShare = false,
		isWatching = false,
		hasScreenShareAudio = false,
		isOwnScreenShare = false,
		onStopWatching,
		hiddenConnectionCount = 0,
		deviceConnectionCount = 0,
		isDeviceGroupExpanded = false,
		onToggleDeviceGroup,
	}) => {
		const {i18n} = useLingui();
		const {groups, member, canMoveMembers, userVoiceStates, hasMultipleConnections, hasVoiceChannels} =
			useVoiceParticipantMenuData({
				user,
				guildId,
				connectionId,
				isGroupedItem,
				isParentGroupedItem,
				streamKey,
				isScreenShare,
				isWatching,
				hasScreenShareAudio,
				isOwnScreenShare,
				onStopWatching,
				onClose,
				hiddenConnectionCount,
				deviceConnectionCount,
				isDeviceGroupExpanded,
				onToggleDeviceGroup,
			});
		const connectionIds = useMemo(() => userVoiceStates.map((u) => u.connectionId), [userVoiceStates]);
		const guild = guildId ? Guilds.getGuild(guildId) : null;
		const hasRoles = guild && Object.values(guild.roles).some((r) => !r.isEveryone);
		const canManageRoles = guildId ? Permission.can(Permissions.MANAGE_ROLES, {guildId}) : false;
		const memberHasVisibleRoles = useMemo(() => {
			if (!guild || !member) {
				return false;
			}
			return Object.values(guild.roles).some((role) => !role.isEveryone && member.roles.has(role.id));
		}, [guild, member]);
		const shouldShowManageRoles = hasRoles && (canManageRoles || memberHasVisibleRoles);
		return (
			<>
				<DataMenuRenderer groups={groups} data-flx="ui.action-menu.voice-participant-context-menu.data-menu-renderer" />
				{isGroupedItem && connectionId && guildId && hasVoiceChannels && (
					<MenuGroup data-flx="ui.action-menu.voice-participant-context-menu.menu-group">
						<MoveToChannelSubmenu
							userId={user.id}
							guildId={guildId}
							connectionId={connectionId}
							onClose={onClose}
							label={i18n._(MOVE_DEVICE_TO_DESCRIPTOR)}
							data-flx="ui.action-menu.voice-participant-context-menu.move-to-channel-submenu"
						/>
					</MenuGroup>
				)}
				{isParentGroupedItem && hasMultipleConnections && guildId && hasVoiceChannels && (
					<MenuGroup data-flx="ui.action-menu.voice-participant-context-menu.menu-group--2">
						<MoveToChannelSubmenu
							userId={user.id}
							guildId={guildId}
							connectionIds={connectionIds}
							onClose={onClose}
							label={i18n._(MOVE_ALL_DEVICES_TO_DESCRIPTOR)}
							data-flx="ui.action-menu.voice-participant-context-menu.move-to-channel-submenu--2"
						/>
					</MenuGroup>
				)}
				{guildId && canMoveMembers && !isParentGroupedItem && !isGroupedItem && hasVoiceChannels && (
					<MenuGroup data-flx="ui.action-menu.voice-participant-context-menu.menu-group--3">
						<MoveToChannelSubmenu
							userId={user.id}
							guildId={guildId}
							connectionId={connectionId}
							onClose={onClose}
							label={i18n._(MOVE_TO_DESCRIPTOR)}
							data-flx="ui.action-menu.voice-participant-context-menu.move-to-channel-submenu--3"
						/>
					</MenuGroup>
				)}
				{guildId && member && shouldShowManageRoles && (
					<MenuGroup data-flx="ui.action-menu.voice-participant-context-menu.menu-group--4">
						<ManageRolesMenuItem
							guildId={guildId}
							member={member}
							data-flx="ui.action-menu.voice-participant-context-menu.manage-roles-menu-item"
						/>
					</MenuGroup>
				)}
			</>
		);
	},
);
