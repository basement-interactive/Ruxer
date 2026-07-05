// SPDX-License-Identifier: AGPL-3.0-or-later

import {shouldDisableAutofocusOnMobile} from '@app/features/platform/utils/AutofocusUtils';
import {isTextInputKeyEvent} from '@app/features/platform/utils/IsTextInputKeyEvent';
import QuickSwitcher from '@app/features/search/state/QuickSwitcher';
import Modal from '@app/features/ui/state/Modal';
import {useEffect} from 'react';

const MODAL_KEYBOARD_SELECTOR = '[role="dialog"], .modal-backdrop';
const isTextEntryElement = (element: Element | null): boolean => {
	if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
		return true;
	}
	return element instanceof HTMLElement && element.isContentEditable;
};
const isElementInsideModal = (element: Element | null): boolean => {
	return Boolean(element?.closest(MODAL_KEYBOARD_SELECTOR));
};

interface SearchInputRef {
	current: HTMLInputElement | null;
}

export const useSearchInputAutofocus = (inputRef: SearchInputRef) => {
	useEffect(() => {
		if (shouldDisableAutofocusOnMobile()) {
			return;
		}
		const shouldBlockDueToModal = (): boolean => {
			if (!Modal.hasModalOpen()) {
				return false;
			}
			const input = inputRef.current;
			return !isElementInsideModal(input);
		};
		if (!shouldBlockDueToModal()) {
			inputRef.current?.focus({preventScroll: true});
		}
		const handleGlobalKeyDown = (event: KeyboardEvent) => {
			if (QuickSwitcher.getIsOpen()) {
				return;
			}
			if (shouldBlockDueToModal()) {
				return;
			}
			const activeElement = document.activeElement;
			if (activeElement === inputRef.current) {
				return;
			}
			if (isTextEntryElement(activeElement)) {
				return;
			}
			if (!isTextInputKeyEvent(event)) {
				return;
			}
			inputRef.current?.focus({preventScroll: true});
		};
		document.addEventListener('keydown', handleGlobalKeyDown);
		return () => document.removeEventListener('keydown', handleGlobalKeyDown);
	}, [inputRef]);
};
