// SPDX-License-Identifier: AGPL-3.0-or-later

import type {Channel} from '@app/features/channel/models/Channel';
import {
	COPY_CHANNEL_ID_DESCRIPTOR,
	COPY_COMMUNITY_ID_DESCRIPTOR,
} from '@app/features/i18n/utils/CommonMessageDescriptors';
import type {Message} from '@app/features/messaging/models/MessagingMessage';
import {REPORT_COMMUNITY_DESCRIPTOR} from '@app/features/moderation/utils/ModerationMessageDescriptors';
import {openReportGuildModal} from '@app/features/moderation/utils/ReportActionUtils';
import {CopyIdIcon, ReportUserIcon} from '@app/features/ui/action_menu/ContextMenuIcons';
import {MenuGroup} from '@app/features/ui/action_menu/MenuGroup';
import {MenuItem} from '@app/features/ui/action_menu/MenuItem';
import {MessageContextMenu} from '@app/features/ui/action_menu/MessageContextMenu';
import * as TextCopyCommands from '@app/features/ui/commands/TextCopyCommands';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback} from 'react';

interface InviteEmbedContextMenuProps {
	message?: Message;
	sourceChannel?: Channel | null;
	linkUrl?: string;
	guild?: {id: string; name: string} | null;
	channelId?: string | null;
	inviteCode?: string | null;
	onDelete?: (bypassConfirm?: boolean) => void;
	onClose: () => void;
}

export const InviteEmbedContextMenu: React.FC<InviteEmbedContextMenuProps> = observer(
	({message, sourceChannel, linkUrl, guild, channelId, inviteCode, onDelete, onClose}) => {
		const {i18n} = useLingui();
		const handleCopyGuildId = useCallback(() => {
			if (!guild) return;
			void TextCopyCommands.copy(i18n, guild.id);
			onClose();
		}, [guild, i18n, onClose]);
		const handleCopyChannelId = useCallback(() => {
			if (!channelId) return;
			void TextCopyCommands.copy(i18n, channelId);
			onClose();
		}, [channelId, i18n, onClose]);
		const handleReportGuild = useCallback(() => {
			if (!guild) return;
			onClose();
			openReportGuildModal({i18n, guild, inviteCode: inviteCode ?? undefined});
		}, [guild, i18n, inviteCode, onClose]);
		const hasAnyCopy = guild != null || channelId != null;
		const canReport = guild != null && inviteCode != null;
		const canRenderMessageMenu = message != null && onDelete != null;
		if (!canRenderMessageMenu && !hasAnyCopy && !canReport) {
			return null;
		}
		return (
			<>
				{canRenderMessageMenu && (
					<MessageContextMenu
						message={message}
						sourceChannel={sourceChannel}
						linkUrl={linkUrl}
						onClose={onClose}
						onDelete={onDelete}
						data-flx="ui.action-menu.invite-embed-context-menu.message-context-menu"
					/>
				)}
				{hasAnyCopy && (
					<MenuGroup data-flx="ui.action-menu.invite-embed-context-menu.menu-group">
						{guild != null && (
							<MenuItem
								icon={<CopyIdIcon data-flx="ui.action-menu.invite-embed-context-menu.copy-id-icon" />}
								onClick={handleCopyGuildId}
								data-flx="ui.action-menu.invite-embed-context-menu.menu-item.copy-guild-id"
							>
								{i18n._(COPY_COMMUNITY_ID_DESCRIPTOR)}
							</MenuItem>
						)}
						{channelId != null && (
							<MenuItem
								icon={<CopyIdIcon data-flx="ui.action-menu.invite-embed-context-menu.copy-id-icon--2" />}
								onClick={handleCopyChannelId}
								data-flx="ui.action-menu.invite-embed-context-menu.menu-item.copy-channel-id"
							>
								{i18n._(COPY_CHANNEL_ID_DESCRIPTOR)}
							</MenuItem>
						)}
					</MenuGroup>
				)}
				{canReport && (
					<MenuGroup data-flx="ui.action-menu.invite-embed-context-menu.menu-group--2">
						<MenuItem
							icon={<ReportUserIcon data-flx="ui.action-menu.invite-embed-context-menu.report-user-icon" />}
							onClick={handleReportGuild}
							danger
							data-flx="ui.action-menu.invite-embed-context-menu.menu-item.report-guild"
						>
							{i18n._(REPORT_COMMUNITY_DESCRIPTOR)}
						</MenuItem>
					</MenuGroup>
				)}
			</>
		);
	},
);
