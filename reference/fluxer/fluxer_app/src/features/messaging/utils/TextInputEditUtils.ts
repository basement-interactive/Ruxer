// SPDX-License-Identifier: AGPL-3.0-or-later

export type EditableTextInput = HTMLInputElement | HTMLTextAreaElement;

export function isEditableTextInput(element: Element | null): element is EditableTextInput {
	return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement;
}

export function isDocumentPasteTarget(element: Element | null): boolean {
	return element == null || element === document.body || element === document.documentElement;
}

const DIALOG_PASTE_TARGET_SELECTOR = '[role="dialog"], [aria-modal="true"]';

export function isDialogPasteTarget(target: EventTarget | null): boolean {
	return target instanceof Element && target.closest(DIALOG_PASTE_TARGET_SELECTOR) !== null;
}

export function replaceTextRange(
	input: EditableTextInput,
	text: string,
	start: number,
	end: number,
	opts: {inputType?: string; selectionMode?: SelectionMode; preferNative?: boolean} = {},
): boolean {
	const rangeStart = Math.min(start, end);
	const rangeEnd = Math.max(start, end);
	const expectedValue = input.value.slice(0, rangeStart) + text + input.value.slice(rangeEnd);
	const selectionMode = opts.selectionMode ?? 'end';
	if (opts.preferNative ?? true) {
		if (typeof document !== 'undefined' && document.activeElement !== input) {
			try {
				input.focus({preventScroll: true});
			} catch {}
		}
		if (typeof document !== 'undefined' && document.activeElement === input) {
			try {
				input.setSelectionRange(rangeStart, rangeEnd);
				const command = text.length === 0 ? 'delete' : 'insertText';
				const ok = document.execCommand(command, false, text);
				if (ok && input.value === expectedValue) {
					return true;
				}
			} catch {}
		}
	}
	try {
		input.setRangeText(text, rangeStart, rangeEnd, selectionMode);
	} catch {
		return false;
	}
	input.dispatchEvent(
		new InputEvent('input', {
			bubbles: true,
			data: text || null,
			inputType: opts.inputType ?? (text.length === 0 ? 'deleteContent' : 'insertText'),
		}),
	);
	return true;
}

export function replaceSelectedText(input: EditableTextInput, text: string): boolean {
	const start = input.selectionStart ?? input.value.length;
	const end = input.selectionEnd ?? input.value.length;
	return replaceTextRange(input, text, start, end);
}

export function insertTextAtCursor(input: EditableTextInput, text: string): boolean {
	const start = input.selectionStart ?? input.value.length;
	const end = input.selectionEnd ?? input.value.length;
	return replaceTextRange(input, text, start, end);
}

export function deleteTextRange(input: EditableTextInput, start: number, end: number): boolean {
	return replaceTextRange(input, '', start, end, {inputType: 'deleteContent'});
}

export function deleteSelectedTextWithInputEvent(input: EditableTextInput): boolean {
	const start = input.selectionStart ?? input.value.length;
	const end = input.selectionEnd ?? input.value.length;
	return deleteTextRange(input, start, end);
}

export function setTextSelection(input: EditableTextInput, start: number, end = start): void {
	try {
		input.setSelectionRange(start, end);
	} catch {}
}

export function scheduleTextSelection(input: EditableTextInput, start: number, end = start): void {
	window.requestAnimationFrame(() => {
		setTextSelection(input, start, end);
	});
}

export function setTextSelectionSoon(input: EditableTextInput, start: number, end = start): void {
	setTimeout(() => {
		setTextSelection(input, start, end);
	}, 0);
}

export function replaceWholeText(input: EditableTextInput, text: string): boolean {
	return replaceTextRange(input, text, 0, input.value.length);
}

export function appendText(input: EditableTextInput, text: string): boolean {
	return replaceTextRange(input, text, input.value.length, input.value.length);
}

export function replaceSelectedTextWithoutNativeUndo(input: EditableTextInput, text: string): boolean {
	const start = input.selectionStart ?? input.value.length;
	const end = input.selectionEnd ?? input.value.length;
	return replaceTextRange(input, text, start, end, {preferNative: false});
}

export function deleteTextRangeWithoutNativeUndo(input: EditableTextInput, start: number, end: number): boolean {
	return replaceTextRange(input, '', start, end, {inputType: 'deleteByCut', preferNative: false});
}

export function deleteSelectedTextWithoutNativeUndo(input: EditableTextInput): boolean {
	const start = input.selectionStart ?? input.value.length;
	const end = input.selectionEnd ?? input.value.length;
	return deleteTextRangeWithoutNativeUndo(input, start, end);
}

export function replaceSelectedTextWithInputEvent(input: EditableTextInput, text: string): boolean {
	return replaceSelectedTextWithoutNativeUndo(input, text);
}

export function deleteSelectedTextWithSyntheticInput(
	input: EditableTextInput,
	opts: {dispatchInput?: boolean} = {},
): boolean {
	const start = input.selectionStart ?? input.value.length;
	const end = input.selectionEnd ?? input.value.length;
	try {
		input.setRangeText('', Math.min(start, end), Math.max(start, end), 'start');
	} catch {
		return false;
	}
	if (opts.dispatchInput ?? true) {
		input.dispatchEvent(new InputEvent('input', {bubbles: true, data: null, inputType: 'deleteByCut'}));
	}
	return true;
}

export function deleteSelectedText(input: EditableTextInput, opts: {dispatchInput?: boolean} = {}): boolean {
	return deleteSelectedTextWithSyntheticInput(input, opts);
}
