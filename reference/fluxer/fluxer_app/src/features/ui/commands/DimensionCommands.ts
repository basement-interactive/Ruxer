// SPDX-License-Identifier: AGPL-3.0-or-later

import Dimension from '@app/features/ui/state/Dimension';

type DimensionIntent =
	| {kind: 'channel-list-scroll'; guildId: string; scrollTop: number}
	| {kind: 'clear-channel-scroll-target'; guildId: string}
	| {kind: 'guild-list-scroll'; scrollTop: number};

function dispatchDimensionIntent(intent: DimensionIntent): void {
	switch (intent.kind) {
		case 'channel-list-scroll':
			Dimension.updateGuildDimensions(intent.guildId, intent.scrollTop, undefined);
			return;
		case 'clear-channel-scroll-target':
			Dimension.updateGuildDimensions(intent.guildId, undefined, null);
			return;
		case 'guild-list-scroll':
			Dimension.updateGuildListDimensions(intent.scrollTop);
			return;
	}
}

export function updateChannelListScroll(guildId: string, scrollTop: number): void {
	dispatchDimensionIntent({kind: 'channel-list-scroll', guildId, scrollTop});
}

export function clearChannelListScrollTo(guildId: string): void {
	dispatchDimensionIntent({kind: 'clear-channel-scroll-target', guildId});
}

export function updateGuildListScroll(scrollTop: number): void {
	dispatchDimensionIntent({kind: 'guild-list-scroll', scrollTop});
}
