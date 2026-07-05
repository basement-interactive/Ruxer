// SPDX-License-Identifier: AGPL-3.0-or-later

import {GuildMemberContextMenu} from '@app/features/ui/action_menu/GuildMemberContextMenu';
import type {User} from '@app/features/user/models/User';

export function renderGuildMemberContextMenu(
	user: User,
	guildId: string,
	onClose: () => void,
	onAfterClose: () => void,
) {
	return (
		<GuildMemberContextMenu
			user={user}
			onClose={() => {
				onClose();
				onAfterClose();
			}}
			guildId={guildId}
			data-flx="channel.guild-members-page.render-guild-member-context-menu.guild-member-context-menu"
		/>
	);
}
