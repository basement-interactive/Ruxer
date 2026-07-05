// SPDX-License-Identifier: AGPL-3.0-or-later

import Accessibility, {type AccessibilitySettings} from '@app/features/accessibility/state/Accessibility';
import {
	createMotionPreferencesContext,
	type MotionPreferencesWrite,
	resolveAnimateEmojiRequest,
	resolveAnimateStickersRequest,
	resolveGifAutoPlayRequest,
	type StickerAnimation,
} from '@app/features/accessibility/state/MotionPreferencesMachine';
import type {UserSettingsPatch} from '@app/features/user/commands/UserSettingsCommands';
import * as UserSettingsCommands from '@app/features/user/commands/UserSettingsCommands';
import UserSettings from '@app/features/user/state/UserSettings';

type AccessibilityPatch = Partial<AccessibilitySettings>;

function applyAccessibilityPatch(settings: AccessibilityPatch): void {
	Accessibility.updateSettings(settings);
}

export function update(settings: AccessibilityPatch): void {
	applyAccessibilityPatch(settings);
}

function applyMotionPreferencesWrite(write: MotionPreferencesWrite): void {
	const userPatch: UserSettingsPatch = {};
	if (write.animateEmoji !== undefined) userPatch.animateEmoji = write.animateEmoji;
	if (write.gifAutoPlay !== undefined) userPatch.gifAutoPlay = write.gifAutoPlay;
	if (write.animateStickers !== undefined) userPatch.animateStickers = write.animateStickers;

	const accessibilityPatch: AccessibilityPatch = {};
	if (write.mobileAnimateEmojiOverridden !== undefined)
		accessibilityPatch.mobileAnimateEmojiOverridden = write.mobileAnimateEmojiOverridden;
	if (write.mobileAnimateEmojiValue !== undefined)
		accessibilityPatch.mobileAnimateEmojiValue = write.mobileAnimateEmojiValue;
	if (write.mobileGifAutoPlayOverridden !== undefined)
		accessibilityPatch.mobileGifAutoPlayOverridden = write.mobileGifAutoPlayOverridden;
	if (write.mobileGifAutoPlayValue !== undefined)
		accessibilityPatch.mobileGifAutoPlayValue = write.mobileGifAutoPlayValue;
	if (write.mobileStickerAnimationOverridden !== undefined)
		accessibilityPatch.mobileStickerAnimationOverridden = write.mobileStickerAnimationOverridden;
	if (write.mobileStickerAnimationValue !== undefined)
		accessibilityPatch.mobileStickerAnimationValue = write.mobileStickerAnimationValue;
	if (write.keepAnimatedEmojiUnderReducedMotion !== undefined)
		accessibilityPatch.keepAnimatedEmojiUnderReducedMotion = write.keepAnimatedEmojiUnderReducedMotion;
	if (write.keepGifAutoPlayUnderReducedMotion !== undefined)
		accessibilityPatch.keepGifAutoPlayUnderReducedMotion = write.keepGifAutoPlayUnderReducedMotion;
	if (write.keepStickerAnimationUnderReducedMotion !== undefined)
		accessibilityPatch.keepStickerAnimationUnderReducedMotion = write.keepStickerAnimationUnderReducedMotion;

	if (Object.keys(accessibilityPatch).length > 0) {
		applyAccessibilityPatch(accessibilityPatch);
	}
	if (Object.keys(userPatch).length > 0) {
		void UserSettingsCommands.update(userPatch);
	}
}

function currentMotionContext() {
	return createMotionPreferencesContext(UserSettings.getMotionPreferencesInput());
}

export function requestAnimateEmoji(value: boolean): void {
	applyMotionPreferencesWrite(resolveAnimateEmojiRequest(currentMotionContext(), value));
}

export function requestGifAutoPlay(value: boolean): void {
	applyMotionPreferencesWrite(resolveGifAutoPlayRequest(currentMotionContext(), value));
}

export function requestAnimateStickers(value: StickerAnimation): void {
	applyMotionPreferencesWrite(resolveAnimateStickersRequest(currentMotionContext(), value));
}
