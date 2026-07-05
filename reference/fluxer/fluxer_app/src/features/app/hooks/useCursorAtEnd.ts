// SPDX-License-Identifier: AGPL-3.0-or-later

import {useCallback, useRef} from 'react';

export function useCursorAtEnd<T extends HTMLInputElement | HTMLTextAreaElement>(): React.RefCallback<T> {
	const cleanupRef = useRef<(() => void) | null>(null);
	const currentNodeRef = useRef<T | null>(null);
	return useCallback((node: T | null) => {
		if (node === currentNodeRef.current) {
			return;
		}
		cleanupRef.current?.();
		cleanupRef.current = null;
		currentNodeRef.current = node;
		if (!node) {
			return;
		}
		const element = node;
		let isActive = true;
		let frameId: number | null = null;
		function placeCursorAtEnd(): void {
			if (!isActive || document.activeElement !== element) {
				return;
			}
			const length = element.value.length;
			element.setSelectionRange(length, length);
		}
		function scheduleCursorPlacement(): void {
			if (frameId !== null) {
				cancelAnimationFrame(frameId);
			}
			frameId = requestAnimationFrame(() => {
				frameId = null;
				placeCursorAtEnd();
			});
		}
		element.addEventListener('focus', scheduleCursorPlacement);
		scheduleCursorPlacement();
		cleanupRef.current = () => {
			isActive = false;
			element.removeEventListener('focus', scheduleCursorPlacement);
			if (frameId !== null) {
				cancelAnimationFrame(frameId);
				frameId = null;
			}
			if (currentNodeRef.current === element) {
				currentNodeRef.current = null;
			}
		};
	}, []);
}
