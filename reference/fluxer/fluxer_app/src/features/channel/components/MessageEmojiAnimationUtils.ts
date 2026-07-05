// SPDX-License-Identifier: AGPL-3.0-or-later

export interface MessageEmojiAnimationState {
	animateEmojiSetting: boolean;
	animatedMediaPlaybackAllowed?: boolean;
	stayInteractiveWhenUnfocused?: boolean;
	windowFocused?: boolean;
	windowVisible?: boolean;
}

export function shouldAnimateMessageEmojiByDefault({
	animateEmojiSetting,
	animatedMediaPlaybackAllowed,
	stayInteractiveWhenUnfocused,
	windowFocused,
	windowVisible,
}: MessageEmojiAnimationState): boolean {
	if (!animateEmojiSetting) return false;
	if (animatedMediaPlaybackAllowed !== undefined) return animatedMediaPlaybackAllowed;
	if (!windowVisible) return false;
	return Boolean(windowFocused || stayInteractiveWhenUnfocused);
}
