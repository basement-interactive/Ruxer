// SPDX-License-Identifier: AGPL-3.0-or-later

import {deleteSelectedText} from '@app/features/messaging/utils/TextInputEditUtils';

export function clearTextareaWithInputEvent(textarea: HTMLTextAreaElement): boolean {
	if (textarea.value.length === 0) {
		return true;
	}
	if (typeof document === 'undefined') {
		return false;
	}
	if (document.activeElement !== textarea) {
		try {
			textarea.focus({preventScroll: true});
		} catch {}
		if (document.activeElement !== textarea) {
			return false;
		}
	}
	try {
		textarea.setSelectionRange(0, textarea.value.length);
	} catch {
		return false;
	}
	if (deleteSelectionPreservingNativeUndo(textarea)) {
		return true;
	}
	return deleteSelectedText(textarea);
}

function deleteSelectionPreservingNativeUndo(textarea: HTMLTextAreaElement): boolean {
	if (typeof document.execCommand !== 'function') {
		return false;
	}
	try {
		return document.execCommand('delete') && textarea.value.length === 0;
	} catch {
		return false;
	}
}
