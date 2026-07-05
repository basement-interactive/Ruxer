// SPDX-License-Identifier: AGPL-3.0-or-later

import {TEXT_BASED_CHANNEL_TYPES} from '@fluxer/constants/src/ChannelConstants';

export function isForwardableChannelType(channelType: number): boolean {
	return TEXT_BASED_CHANNEL_TYPES.has(channelType);
}
