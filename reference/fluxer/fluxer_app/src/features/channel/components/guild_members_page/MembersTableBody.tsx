// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/channel/components/GuildMembersPage.module.css';
import type {MembersTableBodyProps} from '@app/features/channel/components/guild_members_page/GuildMembersPageShared';
import {MembersTableEmptyState} from '@app/features/channel/components/guild_members_page/MembersTableEmptyState';
import {MemberTableRow} from '@app/features/channel/components/guild_members_page/MemberTableRow';
import type React from 'react';

export function MembersTableBody({
	guildId,
	members,
	showProgress,
	showError,
	showEmptySearch,
	ownerId,
	hideOwnerCrown,
	activeMenuMemberId,
	contextMenuMemberId,
	onActionsClick,
	onContextMenu,
	onRowClick,
}: MembersTableBodyProps) {
	let content: React.ReactNode = null;
	if (!showProgress) {
		if (showError) {
			content = (
				<MembersTableEmptyState
					variant="error"
					data-flx="channel.guild-members-page.members-table-body.members-table-empty-state"
				/>
			);
		} else if (showEmptySearch) {
			content = (
				<MembersTableEmptyState
					variant="empty-search"
					data-flx="channel.guild-members-page.members-table-body.members-table-empty-state--2"
				/>
			);
		} else {
			content = members.map((data) => (
				<MemberTableRow
					key={data.userId}
					data={data}
					guildId={guildId}
					isOwner={ownerId === data.userId && !hideOwnerCrown}
					activeMenuMemberId={activeMenuMemberId}
					contextMenuMemberId={contextMenuMemberId}
					onActionsClick={onActionsClick}
					onContextMenu={onContextMenu}
					onRowClick={onRowClick}
					data-flx="channel.guild-members-page.members-table-body.member-table-row.context-menu"
				/>
			));
		}
	}
	return (
		<div
			className={styles.tableBody}
			role="rowgroup"
			data-flx="channel.guild-members-page.members-table-body.table-body"
		>
			{content}
		</div>
	);
}
