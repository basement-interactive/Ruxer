// SPDX-License-Identifier: AGPL-3.0-or-later

import KeybindManager from '@app/features/app/keybindings/KeybindManager';
import ContextMenuState from '@app/features/ui/state/ContextMenu';
import {type RefObject, useEffect} from 'react';

function clearDocumentSelection(): void {
	if (typeof document === 'undefined') return;
	document.getSelection()?.removeAllRanges();
}

function isEditableTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	if (target.isContentEditable) return true;
	return (
		target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement
	);
}

function isSelectAllShortcut(event: KeyboardEvent): boolean {
	if (event.defaultPrevented || event.altKey || event.shiftKey) return false;
	if (!event.ctrlKey && !event.metaKey) return false;
	return event.key.toLowerCase() === 'a';
}

function selectSplashScreenContents(root: HTMLElement): void {
	const ownerDocument = root.ownerDocument;
	const selection = ownerDocument.getSelection();
	if (!selection) return;
	const range = ownerDocument.createRange();
	range.selectNodeContents(root);
	selection.removeAllRanges();
	selection.addRange(range);
}

export function useSplashScreenGuard(selectionRootRef?: RefObject<HTMLElement | null>): void {
	useEffect(() => {
		KeybindManager.suspend();
		if (typeof document === 'undefined') {
			return () => {
				KeybindManager.resume();
			};
		}
		clearDocumentSelection();
		ContextMenuState.close();
		const handleSelectAll = (event: KeyboardEvent) => {
			if (!isSelectAllShortcut(event) || isEditableTarget(event.target)) return;
			const selectionRoot = selectionRootRef?.current;
			if (!selectionRoot) return;
			event.preventDefault();
			selectSplashScreenContents(selectionRoot);
		};
		document.addEventListener('keydown', handleSelectAll, {capture: true});
		if (document.activeElement instanceof HTMLElement) {
			document.activeElement.blur();
		}
		return () => {
			document.removeEventListener('keydown', handleSelectAll, {capture: true});
			KeybindManager.resume();
		};
	}, [selectionRootRef]);
}
