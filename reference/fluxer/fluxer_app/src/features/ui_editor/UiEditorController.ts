// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Tiny cross-component opener for the UI editor. The editor panel lives in
// `UiEditorGate` (mounted at the app root), but it needs to be openable from
// elsewhere — a Settings tab button, a keyboard shortcut, the floating tab.
// Rather than thread state through the tree, callers fire `openUiEditor()` and
// the gate subscribes. A plain event target keeps it dependency-free.

const target = new EventTarget();
const OPEN_EVENT = 'ruxer:open-ui-editor';

/** Open the UI editor from anywhere (e.g. a Settings button). */
export function openUiEditor(): void {
	target.dispatchEvent(new Event(OPEN_EVENT));
}

/** Gate-internal: subscribe to open requests. Returns an unsubscribe fn. */
export function onOpenUiEditor(cb: () => void): () => void {
	target.addEventListener(OPEN_EVENT, cb);
	return () => target.removeEventListener(OPEN_EVENT, cb);
}
