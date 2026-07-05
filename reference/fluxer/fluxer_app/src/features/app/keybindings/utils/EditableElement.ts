// SPDX-License-Identifier: AGPL-3.0-or-later

import type {KeybindCommand} from '@app/features/input/state/InputKeybind';

const NON_TEXT_INPUT_TYPES = new Set([
	'button',
	'checkbox',
	'radio',
	'range',
	'color',
	'file',
	'image',
	'submit',
	'reset',
]);
export const isEditableElement = (target: EventTarget | null): target is HTMLElement => {
	if (!(target instanceof HTMLElement)) return false;
	if (target.isContentEditable) return true;
	const tagName = target.tagName;
	if (tagName === 'TEXTAREA') return true;
	if (tagName === 'INPUT') {
		const type = ((target as HTMLInputElement).type || '').toLowerCase();
		return !NON_TEXT_INPUT_TYPES.has(type);
	}
	return false;
};
export const CHANNEL_TEXTAREA_SELECTOR = '[data-channel-textarea]';
export const EDITABLE_CAPTURE_SHORTCUT_ACTIONS = new Set<KeybindCommand>(['chat_upload']);
export const isChannelTextareaElement = (target: HTMLElement): boolean => target.matches(CHANNEL_TEXTAREA_SELECTOR);
export const getEditableElementValue = (target: HTMLElement): string => {
	if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
		return target.value;
	}
	return target.textContent ?? '';
};
