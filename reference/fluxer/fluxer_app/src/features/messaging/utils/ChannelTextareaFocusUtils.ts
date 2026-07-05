// SPDX-License-Identifier: AGPL-3.0-or-later

import {ComponentDispatch} from '@app/features/platform/utils/ComponentBus';

export function focusChannelTextareaAfterNavigation(channelId: string): void {
	const requestFocus = () => {
		ComponentDispatch.dispatch('FOCUS_TEXTAREA', {channelId});
	};
	window.requestAnimationFrame(requestFocus);
	window.setTimeout(requestFocus, 300);
}
