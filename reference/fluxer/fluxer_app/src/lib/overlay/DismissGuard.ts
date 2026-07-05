// SPDX-License-Identifier: AGPL-3.0-or-later

let lastPointerDownTarget: Node | null = null;

const recordPointerDown = (event: Event) => {
	const target = event.target;
	lastPointerDownTarget = target instanceof Node ? target : null;
};

if (typeof document !== 'undefined') {
	document.addEventListener('mousedown', recordPointerDown, true);
	document.addEventListener('touchstart', recordPointerDown, true);
	document.addEventListener('pointerdown', recordPointerDown, true);
}

export function wasPointerDownInside(container: Element | null | undefined): boolean {
	if (!container || !lastPointerDownTarget) return false;
	return container.contains(lastPointerDownTarget);
}
