// SPDX-License-Identifier: AGPL-3.0-or-later

let activeDrags = 0;
let pendingClear: number | null = null;

const updateAttribute = (isActive: boolean): void => {
	if (!document.body) return;
	if (isActive) {
		document.body.setAttribute('data-scrollbar-dragging', 'true');
	} else {
		document.body.removeAttribute('data-scrollbar-dragging');
	}
};
const clearPendingTimeout = (): void => {
	if (pendingClear == null) return;
	window.clearTimeout(pendingClear);
	pendingClear = null;
};
const decrementDragCount = (): void => {
	if (activeDrags === 0) return;
	activeDrags -= 1;
	if (activeDrags === 0) {
		updateAttribute(false);
	}
};

export function beginScrollbarDrag() {
	clearPendingTimeout();
	activeDrags += 1;
	updateAttribute(true);
}

export function endScrollbarDrag() {
	clearPendingTimeout();
	decrementDragCount();
}

export function endScrollbarDragDeferred() {
	clearPendingTimeout();
	pendingClear = window.setTimeout(() => {
		pendingClear = null;
		decrementDragCount();
	}, 0);
}

export function isScrollbarDragActive() {
	return activeDrags > 0;
}
