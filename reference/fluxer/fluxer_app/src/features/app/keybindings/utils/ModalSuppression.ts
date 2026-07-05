// SPDX-License-Identifier: AGPL-3.0-or-later

import type {KeybindCommand, KeybindConfig, KeybindSection} from '@app/features/input/state/InputKeybind';
import {isDocumentFullscreenMedia} from '@app/features/platform/utils/FullscreenMediaUtils';

const MODAL_DIALOG_SELECTOR = '[role="dialog"][aria-modal="true"]';
const MODAL_ALLOWED_TARGET_SELECTORS = new Map<KeybindCommand, string>([
	['nav_quick_switcher', '[data-quick-switcher-modal="true"]'],
]);
const MODAL_ALLOWED_ACTIONS = new Set<KeybindCommand>(['system_open_theme_studio_popout']);
const MODAL_ALLOWED_SECTIONS = new Set<KeybindSection>(['voice_and_video']);
export const shouldSuppressLocalShortcutForModalFocus = (
	entry: Pick<KeybindConfig, 'action' | 'section'>,
	target: EventTarget | null,
): boolean => {
	if (MODAL_ALLOWED_ACTIONS.has(entry.action)) return false;
	const allowedTargetSelector = MODAL_ALLOWED_TARGET_SELECTORS.get(entry.action);
	if (allowedTargetSelector && target instanceof Element && target.closest(allowedTargetSelector)) return false;
	if (MODAL_ALLOWED_SECTIONS.has(entry.section)) return false;
	return target instanceof Element && target.closest(MODAL_DIALOG_SELECTOR) !== null;
};
export const shouldSuppressShortcutForFullscreenMedia = (event?: Pick<KeyboardEvent, 'key'> | null): boolean => {
	if (!isDocumentFullscreenMedia()) return false;
	return event?.key !== 'Escape';
};
