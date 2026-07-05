// SPDX-License-Identifier: AGPL-3.0-or-later

import {ChannelTypes} from '@fluxer/constants/src/ChannelConstants';
import {describe, expect, it} from 'vitest';
import {filterViewableChannels} from './ChannelShared';

describe('filterViewableChannels', () => {
	it('excludes link channels from default navigation fallbacks', () => {
		const channels = [
			{id: 'link', type: ChannelTypes.GUILD_LINK, position: 0, guildId: 'guild'},
			{id: 'text', type: ChannelTypes.GUILD_TEXT, position: 1, guildId: 'guild'},
			{id: 'voice', type: ChannelTypes.GUILD_VOICE, position: 2, guildId: 'guild'},
			{id: 'category', type: ChannelTypes.GUILD_CATEGORY, position: 3, guildId: 'guild'},
		];
		expect(filterViewableChannels(channels).map((channel) => channel.id)).toEqual(['text', 'voice']);
	});
});
