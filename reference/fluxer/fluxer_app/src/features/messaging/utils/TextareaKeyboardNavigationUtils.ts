// SPDX-License-Identifier: AGPL-3.0-or-later

type CtrlArrowLeftEvent = Pick<
	KeyboardEvent | React.KeyboardEvent<HTMLTextAreaElement>,
	'key' | 'ctrlKey' | 'altKey' | 'metaKey' | 'shiftKey' | 'defaultPrevented'
>;

type ShiftArrowUpEvent = Pick<
	KeyboardEvent | React.KeyboardEvent<HTMLTextAreaElement>,
	'key' | 'ctrlKey' | 'altKey' | 'metaKey' | 'shiftKey' | 'defaultPrevented'
>;

interface VisualCaretPoint {
	position: number;
	left: number;
	top: number;
}

interface ShiftArrowUpSelectionState {
	anchor: number;
	value: string;
	goalX: number;
}

const CARET_SENTINEL = '\u200b';
const LINE_TOP_TOLERANCE_PX = 2;
const shiftArrowUpSelectionState = new WeakMap<HTMLTextAreaElement, ShiftArrowUpSelectionState>();

function isLineBreak(char: string): boolean {
	return char === '\n' || char === '\r';
}

function isWhitespace(char: string): boolean {
	return /\s/u.test(char);
}

export function getPreviousWordBoundaryAcrossLineStart(value: string, position: number): number {
	let index = Math.max(0, Math.min(position, value.length));
	while (index > 0 && isWhitespace(value[index - 1] ?? '')) {
		index--;
	}
	return index;
}

function getFocusEdge(textarea: HTMLTextAreaElement): number {
	const start = textarea.selectionStart ?? 0;
	const end = textarea.selectionEnd ?? 0;
	if (start === end) return start;
	return textarea.selectionDirection === 'backward' ? start : end;
}

function getAnchorEdge(textarea: HTMLTextAreaElement): number {
	const start = textarea.selectionStart ?? 0;
	const end = textarea.selectionEnd ?? 0;
	if (start === end) return start;
	return textarea.selectionDirection === 'backward' ? end : start;
}

function setSelectionFocus(textarea: HTMLTextAreaElement, anchor: number, focus: number) {
	const start = Math.min(anchor, focus);
	const end = Math.max(anchor, focus);
	const direction: 'forward' | 'backward' | 'none' = start === end ? 'none' : focus < anchor ? 'backward' : 'forward';
	textarea.setSelectionRange(start, end, direction);
}

function syncVisualMirrorStyles(mirror: HTMLDivElement, textarea: HTMLTextAreaElement, style: CSSStyleDeclaration) {
	const typedStyle = style as CSSStyleDeclaration & {
		overflowWrap?: string;
		scrollbarGutter?: string;
		tabSize?: string;
		textRendering?: string;
	};
	const rect = textarea.getBoundingClientRect();
	mirror.style.position = 'absolute';
	mirror.style.top = '0';
	mirror.style.left = '-9999px';
	mirror.style.visibility = 'hidden';
	mirror.style.pointerEvents = 'none';
	mirror.style.zIndex = '-1';
	mirror.style.boxSizing = style.boxSizing;
	mirror.style.width = `${rect.width}px`;
	mirror.style.font = style.font;
	mirror.style.fontFamily = style.fontFamily;
	mirror.style.fontSize = style.fontSize;
	mirror.style.fontWeight = style.fontWeight;
	mirror.style.fontStyle = style.fontStyle;
	mirror.style.fontVariant = style.fontVariant;
	mirror.style.letterSpacing = style.letterSpacing;
	mirror.style.textTransform = style.textTransform;
	mirror.style.textRendering = typedStyle.textRendering ?? '';
	mirror.style.lineHeight = style.lineHeight;
	mirror.style.textAlign = style.textAlign;
	mirror.style.direction = style.direction;
	mirror.style.whiteSpace = style.whiteSpace;
	mirror.style.wordBreak = style.wordBreak;
	mirror.style.overflowWrap = typedStyle.overflowWrap || 'normal';
	mirror.style.overflow = style.overflow;
	mirror.style.scrollbarGutter = typedStyle.scrollbarGutter ?? '';
	mirror.style.tabSize = typedStyle.tabSize || '8';
	mirror.style.paddingTop = style.paddingTop;
	mirror.style.paddingBottom = style.paddingBottom;
	mirror.style.paddingLeft = style.paddingLeft;
	mirror.style.paddingRight = style.paddingRight;
	mirror.style.borderTopWidth = style.borderTopWidth;
	mirror.style.borderBottomWidth = style.borderBottomWidth;
	mirror.style.borderLeftWidth = style.borderLeftWidth;
	mirror.style.borderRightWidth = style.borderRightWidth;
	mirror.style.borderTopStyle = style.borderTopStyle;
	mirror.style.borderBottomStyle = style.borderBottomStyle;
	mirror.style.borderLeftStyle = style.borderLeftStyle;
	mirror.style.borderRightStyle = style.borderRightStyle;
}

function createVisualMirror(textarea: HTMLTextAreaElement): {
	mirror: HTMLDivElement;
	text: Text;
	range: Range;
	mirrorRect: DOMRect;
	remove: () => void;
} | null {
	const ownerDocument = textarea.ownerDocument;
	const body = ownerDocument.body;
	const ownerWindow = ownerDocument.defaultView;
	if (!body || !ownerWindow) return null;
	const mirror = ownerDocument.createElement('div');
	const text = ownerDocument.createTextNode(`${textarea.value}${CARET_SENTINEL}`);
	syncVisualMirrorStyles(mirror, textarea, ownerWindow.getComputedStyle(textarea));
	mirror.append(text);
	body.append(mirror);
	return {
		mirror,
		text,
		range: ownerDocument.createRange(),
		mirrorRect: mirror.getBoundingClientRect(),
		remove: () => mirror.remove(),
	};
}

function getCaretPointInMirror(
	mirrorData: {text: Text; range: Range; mirrorRect: DOMRect},
	position: number,
): Omit<VisualCaretPoint, 'position'> | null {
	const offset = Math.max(0, Math.min(position, mirrorData.text.length - CARET_SENTINEL.length));
	mirrorData.range.setStart(mirrorData.text, offset);
	mirrorData.range.setEnd(mirrorData.text, offset);
	const rect = mirrorData.range.getClientRects()[0] ?? mirrorData.range.getBoundingClientRect();
	if (!rect || !Number.isFinite(rect.left) || !Number.isFinite(rect.top)) return null;
	return {
		left: rect.left - mirrorData.mirrorRect.left,
		top: rect.top - mirrorData.mirrorRect.top,
	};
}

function getCaretPoint(textarea: HTMLTextAreaElement, position: number): Omit<VisualCaretPoint, 'position'> | null {
	const mirrorData = createVisualMirror(textarea);
	if (!mirrorData) return null;
	try {
		return getCaretPointInMirror(mirrorData, position);
	} finally {
		mirrorData.remove();
	}
}

export function getPreviousVisualLineCaretPositionFromPoints(
	points: ReadonlyArray<VisualCaretPoint>,
	focus: number,
	goalX: number,
	lineTopTolerance = LINE_TOP_TOLERANCE_PX,
): number | null {
	const current = points.find((point) => point.position === focus);
	if (!current) return null;
	let previousTop = -Infinity;
	for (const point of points) {
		if (point.position >= focus) break;
		if (point.top < current.top - lineTopTolerance && point.top > previousTop) {
			previousTop = point.top;
		}
	}
	if (previousTop === -Infinity) {
		return focus > 0 ? 0 : null;
	}
	let bestPoint: VisualCaretPoint | null = null;
	let bestDistance = Infinity;
	for (const point of points) {
		if (point.position >= focus) break;
		if (Math.abs(point.top - previousTop) > lineTopTolerance) continue;
		const distance = Math.abs(point.left - goalX);
		if (
			distance < bestDistance ||
			(distance === bestDistance && bestPoint !== null && point.position > bestPoint.position)
		) {
			bestPoint = point;
			bestDistance = distance;
		}
	}
	return bestPoint?.position ?? null;
}

function getPreviousVisualLineCaretPosition(
	textarea: HTMLTextAreaElement,
	focus: number,
	goalX: number,
): number | null {
	const mirrorData = createVisualMirror(textarea);
	if (!mirrorData) return null;
	try {
		const points: Array<VisualCaretPoint> = [];
		for (let position = 0; position <= textarea.value.length; position++) {
			const point = getCaretPointInMirror(mirrorData, position);
			if (!point) continue;
			points.push({position, ...point});
		}
		return getPreviousVisualLineCaretPositionFromPoints(points, focus, goalX);
	} finally {
		mirrorData.remove();
	}
}

export function shouldHandleCtrlArrowLeftAcrossLineStart(
	event: CtrlArrowLeftEvent,
	textarea: HTMLTextAreaElement,
): boolean {
	if (event.defaultPrevented) return false;
	if (event.key !== 'ArrowLeft') return false;
	if (!event.ctrlKey || event.altKey || event.metaKey) return false;
	const focus = getFocusEdge(textarea);
	if (focus <= 0) return false;
	return isLineBreak(textarea.value[focus - 1] ?? '');
}

export function applyCtrlArrowLeftAcrossLineStart(
	event: CtrlArrowLeftEvent,
	textarea: HTMLTextAreaElement,
): number | null {
	const focus = getFocusEdge(textarea);
	const nextFocus = getPreviousWordBoundaryAcrossLineStart(textarea.value, focus);
	if (nextFocus === focus) return null;
	if (event.shiftKey) {
		setSelectionFocus(textarea, getAnchorEdge(textarea), nextFocus);
	} else {
		textarea.setSelectionRange(nextFocus, nextFocus);
	}
	return nextFocus;
}

export function scheduleShiftArrowUpSelectionFallback(
	event: ShiftArrowUpEvent,
	textarea: HTMLTextAreaElement,
	onApplied?: () => void,
) {
	if (event.defaultPrevented) return;
	if (event.key !== 'ArrowUp') return;
	if (!event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
	const beforeFocus = getFocusEdge(textarea);
	if (beforeFocus <= 0) return;
	const beforeAnchor = getAnchorEdge(textarea);
	const beforeValue = textarea.value;
	const previousState = shiftArrowUpSelectionState.get(textarea);
	const isCollapsed = textarea.selectionStart === textarea.selectionEnd;
	let state = previousState;
	if (!state || state.anchor !== beforeAnchor || state.value !== beforeValue || isCollapsed) {
		const point = getCaretPoint(textarea, beforeFocus);
		if (!point) return;
		state = {
			anchor: beforeAnchor,
			value: beforeValue,
			goalX: point.left,
		};
		shiftArrowUpSelectionState.set(textarea, state);
	}
	const applyFallback = () => {
		if (textarea.value !== beforeValue) return;
		const currentFocus = getFocusEdge(textarea);
		if (currentFocus !== beforeFocus) return;
		const nextFocus = getPreviousVisualLineCaretPosition(textarea, currentFocus, state.goalX);
		if (nextFocus == null || nextFocus >= currentFocus) return;
		setSelectionFocus(textarea, getAnchorEdge(textarea), nextFocus);
		onApplied?.();
	};
	textarea.ownerDocument.defaultView?.setTimeout(applyFallback, 0);
}
