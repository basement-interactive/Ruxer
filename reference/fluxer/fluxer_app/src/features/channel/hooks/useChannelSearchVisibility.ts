// SPDX-License-Identifier: AGPL-3.0-or-later

import {ComponentDispatch} from '@app/features/platform/utils/ComponentBus';
import {useEffect} from 'react';

export function useChannelSearchVisibility(channelId: string | null, visible: boolean): void {
	useEffect(() => {
		if (!channelId) return;
		ComponentDispatch.dispatch('LAYOUT_RESIZED', {channelId});
	}, [channelId, visible]);
}
