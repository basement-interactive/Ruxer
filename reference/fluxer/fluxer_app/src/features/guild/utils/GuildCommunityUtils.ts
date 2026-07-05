// SPDX-License-Identifier: AGPL-3.0-or-later

import RuntimeConfig from '@app/features/app/state/RuntimeConfig';

export function isStockCommunityGuild(guildId: string): boolean {
	return RuntimeConfig.singleCommunityEnabled && RuntimeConfig.singleCommunityGuildId === guildId;
}
