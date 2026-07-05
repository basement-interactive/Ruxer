// SPDX-License-Identifier: AGPL-3.0-or-later

import GuildMatureContentAgree from '@app/features/guild/state/GuildMatureContentAgree';

type MatureContentScope = 'channel' | 'category' | 'guild';

function recordMatureContentAgreement(scope: MatureContentScope, id: string): void {
	switch (scope) {
		case 'channel':
			GuildMatureContentAgree.agreeToChannel(id);
			return;
		case 'category':
			GuildMatureContentAgree.agreeToCategory(id);
			return;
		case 'guild':
			GuildMatureContentAgree.agreeToGuild(id);
			return;
	}
}

export function agreeToChannel(channelId: string): void {
	recordMatureContentAgreement('channel', channelId);
}

export function agreeToCategory(categoryId: string): void {
	recordMatureContentAgreement('category', categoryId);
}

export function agreeToGuild(guildId: string): void {
	recordMatureContentAgreement('guild', guildId);
}
