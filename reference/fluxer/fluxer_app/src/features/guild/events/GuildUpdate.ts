// SPDX-License-Identifier: AGPL-3.0-or-later

import Emoji from '@app/features/emoji/state/Emoji';
import Sticker from '@app/features/emoji/state/EmojiSticker';
import type {GatewayHandlerContext} from '@app/features/gateway/events/EventRouter';
import GuildAvailability from '@app/features/guild/state/GuildAvailability';
import GuildList from '@app/features/guild/state/GuildList';
import Guilds from '@app/features/guild/state/Guilds';
import GuildVerification from '@app/features/guild/state/GuildVerification';
import Permission from '@app/features/permissions/state/Permission';
import QuickSwitcher from '@app/features/search/state/QuickSwitcher';
import Nagbar from '@app/features/ui/state/Nagbar';
import type {Guild} from '@fluxer/schema/src/domains/guild/GuildResponseSchemas';

export function handleGuildUpdate(data: Guild, _context: GatewayHandlerContext): void {
	GuildAvailability.setGuildAvailable(data.id);
	Guilds.handleGuildUpdate(data);
	GuildList.handleGuild(data);
	Sticker.handleGuildUpdate(data);
	Nagbar.handleGuildUpdate({guild: data});
	Emoji.handleGuildUpdate({guild: data});
	Permission.handleGuild();
	GuildVerification.handleGuildUpdate({id: data.id});
	QuickSwitcher.recomputeIfOpen();
}
