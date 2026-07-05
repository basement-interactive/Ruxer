// SPDX-License-Identifier: AGPL-3.0-or-later

import Autocomplete from '@app/features/search/state/Autocomplete';

type HighlightIntent = {kind: 'channel'; channelId: string} | {kind: 'clear'};

function applyHighlightIntent(intent: HighlightIntent): void {
	if (intent.kind === 'channel') {
		Autocomplete.highlightChannel(intent.channelId);
		return;
	}
	Autocomplete.highlightChannelClear();
}

export function highlightChannel(channelId: string): void {
	applyHighlightIntent({kind: 'channel', channelId});
}

export function clearChannelHighlight(): void {
	applyHighlightIntent({kind: 'clear'});
}
