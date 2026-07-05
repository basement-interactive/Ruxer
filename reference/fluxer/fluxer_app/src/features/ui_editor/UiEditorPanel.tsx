// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The in-app UI editor panel. A floating, draggable dock that edits the active
// Layout live through the LayoutEngine.
//
//   * Simple mode  — color/spacing token pickers + reorder/resize/hide the major
//                    regions. Every change applies instantly.
//   * Advanced mode— a LuaU code editor; running the script produces a Layout
//                    via the Rust sandbox and applies it.
//   * Default      — one click reverts to the shipped UI.
//
// Layouts persist locally (LayoutEngine) and can be exported/imported as JSON.

import {useCallback, useEffect, useRef, useState} from 'react';

import {DEFAULT_LAYOUT, KNOWN_REGIONS, LayoutEngine, type Layout} from './LayoutEngine';
import {DEFAULT_LUA_SCRIPT, runLuaLayout} from './LuaBridge';
import {RegionEditorOverlay} from './RegionEditorOverlay';
import styles from './UiEditorPanel.module.css';

/** The design tokens the simple editor exposes as color swatches — the ones the
 * app ACTUALLY renders with (verified by usage count in the app's own CSS):
 * `--brand-primary` (98 files — buttons/links/accents; `--accent-primary`
 * derives from it and is used in only 4, so editing accent-primary did nothing
 * visible), `--background-secondary` (144), `--text-primary` (340), etc. Each
 * swatch may drive MORE than one token when the app reads several near-synonyms
 * for the same visual role — see `TOKEN_ALIASES`. */
const COLOR_TOKENS: ReadonlyArray<{token: string; label: string}> = [
	{token: '--brand-primary', label: 'Accent'},
	{token: '--background-primary', label: 'Background'},
	{token: '--background-secondary', label: 'Sidebar'},
	{token: '--background-tertiary', label: 'Deep background'},
	{token: '--text-primary', label: 'Text'},
	{token: '--text-secondary', label: 'Muted text'},
];

/** Some visual roles are read through several tokens; setting the primary one
 * alone leaves parts of the UI unchanged. When a swatch's token has aliases,
 * we set them all to the same value so the change is uniform. */
const TOKEN_ALIASES: Record<string, string[]> = {
	// Accent: brand-primary is the source, but a handful of components read
	// accent-primary directly — keep them in sync.
	'--brand-primary': ['--accent-primary'],
};

function readComputedToken(token: string): string {
	const v = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
	// Color inputs need #rrggbb; if the theme value isn't hex (e.g. a
	// color-mix or named), fall back to a neutral so the swatch still works.
	return /^#[0-9a-f]{6}$/i.test(v) ? v : '#000000';
}

interface UiEditorPanelProps {
	onClose: () => void;
}

type Mode = 'simple' | 'advanced';

export function UiEditorPanel({onClose}: UiEditorPanelProps): React.ReactElement {
	const [mode, setMode] = useState<Mode>('simple');
	const [editingLayout, setEditingLayout] = useState(false);
	const [layout, setLayout] = useState<Layout>(() => {
		const current = LayoutEngine.get();
		return current.name === 'Default' ? {...DEFAULT_LAYOUT, name: 'My layout'} : current;
	});

	// Apply the FULL layout only when regions change (cheap, infrequent) or on
	// the debounced token commit. Live color dragging does NOT go through here —
	// it uses LayoutEngine.previewToken (a single setProperty, no rebuild/
	// re-render), which is what killed the lag. The committed `layout` still
	// gets applied so it persists + survives Save/reset.
	useEffect(() => {
		LayoutEngine.apply(layout);
	}, [layout]);

	// Debounce committing a token into layout state: the picker fires onChange
	// per pixel dragged, but we only need to fold the final value into `layout`
	// (which triggers a full apply + re-render) once the user settles.
	const commitTimer = useRef<number | undefined>(undefined);
	const setTokenLive = useCallback((token: string, value: string) => {
		// Expand aliases: a visual role read through several tokens gets them all.
		const tokens = [token, ...(TOKEN_ALIASES[token] ?? [])];
		// Instant, no state churn — the app recolors immediately.
		tokens.forEach((t) => LayoutEngine.previewToken(t, value));
		// Debounced commit into layout state so it persists.
		window.clearTimeout(commitTimer.current);
		commitTimer.current = window.setTimeout(() => {
			setLayout((l) => {
				const merged = {...l.tokens};
				tokens.forEach((t) => (merged[t] = value));
				return {...l, tokens: merged};
			});
		}, 150);
	}, []);

	const setRegion = useCallback((anchor: string, patch: Partial<{order: number; hidden: boolean; widthPx: number}>) => {
		setLayout((l) => {
			const regions = [...l.regions];
			const i = regions.findIndex((r) => r.anchor === anchor);
			if (i === -1) regions.push({anchor, ...patch});
			else regions[i] = {...regions[i], ...patch};
			return {...l, regions};
		});
	}, []);

	const toggleHide = useCallback((anchor: string) => {
		setLayout((l) => {
			const regions = [...l.regions];
			const i = regions.findIndex((r) => r.anchor === anchor);
			if (i === -1) regions.push({anchor, hidden: true});
			else regions[i] = {...regions[i], hidden: !regions[i].hidden};
			return {...l, regions};
		});
	}, []);

	const resetToDefault = useCallback(() => {
		LayoutEngine.reset();
		setLayout({...DEFAULT_LAYOUT, name: 'My layout'});
	}, []);

	const saveLayout = useCallback(() => {
		LayoutEngine.saveActive(layout);
	}, [layout]);

	const exportLayout = useCallback(() => {
		const blob = new Blob([JSON.stringify(layout, null, 2)], {type: 'application/json'});
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${layout.name.replace(/\s+/g, '-').toLowerCase()}.ruxerlayout.json`;
		a.click();
		URL.revokeObjectURL(url);
	}, [layout]);

	const importLayout = useCallback((file: File) => {
		void file.text().then((text) => {
			try {
				const imported = LayoutEngine.import(text);
				setLayout(imported);
			} catch (e) {
				// eslint-disable-next-line no-alert
				alert(`Import failed: ${String(e)}`);
			}
		});
	}, []);

	return (
		<>
		{editingLayout && (
			<RegionEditorOverlay
				layout={layout}
				onChange={(anchor, patch) => setRegion(anchor, patch)}
				onToggleHide={toggleHide}
				onClose={() => setEditingLayout(false)}
			/>
		)}
		<div className={styles.dock} role="dialog" aria-label="UI editor" data-flx="ui-editor.dock">
			<header className={styles.header}>
				<span className={styles.brand}>UI Editor</span>
				<div className={styles.modeToggle}>
					<button
						className={`${styles.modeButton} ${mode === 'simple' ? styles.modeActive : ''}`}
						onClick={() => setMode('simple')}
					>
						Simple
					</button>
					<button
						className={`${styles.modeButton} ${mode === 'advanced' ? styles.modeActive : ''}`}
						onClick={() => setMode('advanced')}
					>
						Advanced
					</button>
				</div>
				<button className={styles.closeButton} onClick={onClose} aria-label="Close editor">
					✕
				</button>
			</header>

			<div className={styles.scroll}>
				{mode === 'simple' ? (
					<SimpleMode
						layout={layout}
						onToken={setTokenLive}
						onRegion={setRegion}
						onEditLayout={() => setEditingLayout(true)}
					/>
				) : (
					<AdvancedMode layoutName={layout.name} onApply={setLayout} />
				)}
			</div>

			<footer className={styles.footer}>
				<button className={styles.ghostButton} onClick={resetToDefault}>
					Default layout
				</button>
				<div className={styles.spacer} />
				<label className={styles.ghostButton}>
					Import
					<input
						type="file"
						accept=".json,application/json"
						hidden
						onChange={(e) => e.target.files?.[0] && importLayout(e.target.files[0])}
					/>
				</label>
				<button className={styles.ghostButton} onClick={exportLayout}>
					Export
				</button>
				<button className={styles.primaryButton} onClick={saveLayout}>
					Save
				</button>
			</footer>
		</div>
		</>
	);
}

function SimpleMode({
	layout,
	onToken,
	onRegion,
	onEditLayout,
}: {
	layout: Layout;
	onToken: (token: string, value: string) => void;
	onRegion: (anchor: string, patch: Partial<{order: number; hidden: boolean; widthPx: number}>) => void;
	onEditLayout: () => void;
}): React.ReactElement {
	return (
		<>
			<section className={styles.section}>
				<h3 className={styles.sectionTitle}>Colors</h3>
				<div className={styles.swatchGrid}>
					{COLOR_TOKENS.map(({token, label}) => (
						<label key={token} className={styles.swatch}>
							<input
								type="color"
								className={styles.colorInput}
								value={layout.tokens[token] ?? readComputedToken(token)}
								onChange={(e) => onToken(token, e.target.value)}
							/>
							<span className={styles.swatchLabel}>{label}</span>
						</label>
					))}
				</div>
			</section>

			<section className={styles.section}>
				<h3 className={styles.sectionTitle}>Layout</h3>
				<button className={styles.editLayoutButton} onClick={onEditLayout}>
					✥ Edit layout — drag &amp; resize panels
				</button>
				<p className={styles.sectionHint}>
					Enter edit mode, then drag the highlighted panels to rearrange them or drag an edge to resize.
				</p>
				<div className={styles.regionToggles}>
					{KNOWN_REGIONS.map((r) => {
						const tweak = layout.regions.find((x) => x.anchor === r.anchor);
						return (
							<div key={r.anchor} className={styles.regionRow}>
								<span className={styles.regionLabel}>{r.label}</span>
								<button
									className={`${styles.iconButton} ${tweak?.hidden ? styles.iconActive : ''}`}
									title={tweak?.hidden ? 'Show' : 'Hide'}
									onClick={() => onRegion(r.anchor, {hidden: !tweak?.hidden})}
								>
									{tweak?.hidden ? '🙈' : '👁'}
								</button>
							</div>
						);
					})}
				</div>
			</section>
		</>
	);
}

function AdvancedMode({
	layoutName,
	onApply,
}: {
	layoutName: string;
	onApply: (l: Layout) => void;
}): React.ReactElement {
	const [script, setScript] = useState(DEFAULT_LUA_SCRIPT);
	const [error, setError] = useState<string | null>(null);
	const [running, setRunning] = useState(false);

	const run = useCallback(async () => {
		setRunning(true);
		setError(null);
		const result = await runLuaLayout(script, layoutName);
		setRunning(false);
		if (result.ok && result.layout) {
			onApply(result.layout);
		} else {
			setError(result.error ?? 'Unknown error');
		}
	}, [script, layoutName, onApply]);

	return (
		<div className={styles.advanced}>
			<p className={styles.advancedHint}>
				Write a LuaU script using the <code>ui</code> API. It runs in a sandbox — no file, network, or system
				access.
			</p>
			<textarea
				className={styles.codeEditor}
				value={script}
				spellCheck={false}
				onChange={(e) => setScript(e.target.value)}
			/>
			{error && <pre className={styles.error}>{error}</pre>}
			<button className={styles.primaryButton} onClick={() => void run()} disabled={running}>
				{running ? 'Running…' : 'Run script'}
			</button>
		</div>
	);
}
