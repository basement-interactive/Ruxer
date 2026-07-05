// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Mounts the UI editor: restores the user's saved layout at startup, and
// toggles the editor panel. Desktop-only. The panel opens via Ctrl/Cmd+Shift+U
// or the small floating tab on the right edge, so it never intrudes until asked
// for.

import {isDesktop} from '@app/features/ui/utils/NativeUtils';
import {useEffect, useState} from 'react';

import {LayoutEngine} from './LayoutEngine';
import {onOpenUiEditor} from './UiEditorController';
import styles from './UiEditorGate.module.css';
import {UiEditorPanel} from './UiEditorPanel';

export function UiEditorGate(): React.ReactElement | null {
	const [open, setOpen] = useState(false);
	const enabled = isDesktop();

	// Re-apply the saved layout once on mount so the user's customizations
	// persist across launches.
	useEffect(() => {
		if (enabled) LayoutEngine.restore();
	}, [enabled]);

	// Ctrl/Cmd+Shift+U toggles the editor.
	useEffect(() => {
		if (!enabled) return;
		const onKey = (e: KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'KeyU') {
				e.preventDefault();
				setOpen((v) => !v);
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [enabled]);

	// Opened from the Settings tab (or anywhere) via openUiEditor().
	useEffect(() => {
		if (!enabled) return;
		return onOpenUiEditor(() => setOpen(true));
	}, [enabled]);

	if (!enabled) return null;

	return (
		<>
			{!open && (
				<button
					className={styles.launchTab}
					onClick={() => setOpen(true)}
					title="Customize UI (Ctrl+Shift+U)"
					aria-label="Open UI editor"
				>
					🎨
				</button>
			)}
			{open && <UiEditorPanel onClose={() => setOpen(false)} />}
		</>
	);
}
