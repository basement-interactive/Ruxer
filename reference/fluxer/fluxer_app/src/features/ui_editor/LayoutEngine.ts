// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Layout engine for the in-app UI editor. Applies a serializable "layout" — a
// set of design-token overrides plus per-region tweaks (order / visibility /
// flex-basis) — over the SHIPPED UI without touching component source. Regions
// are addressed by their stable `data-flx` anchors (every major container in
// the app already has one), so the engine is a pure presentation layer on top:
// it injects a single <style> element and toggles a couple of inline styles,
// and can be fully reverted to the default layout at any time.
//
// This is the substrate both editor modes drive:
//   * simple mode  → color/spacing pickers + drag-to-reorder regions
//   * advanced mode→ LuaU scripts (run natively in Rust) emit the same ops
//
// Persistence is local (localStorage); export/import moves a layout as JSON.
// NOTE: uses the PROTECTED accessor, not the bare global `localStorage` — the
// production build `delete window.localStorage` at boot (ProtectedWebStorage),
// so the bare global throws after startup and saved layouts would never persist
// (they'd reset every restart). getProtectedLocalStorage() returns the pre-delete
// reference the rest of the app uses.

import {getProtectedLocalStorage} from '@app/features/platform/state/ProtectedWebStorage';

export interface RegionTweak {
	/** data-flx anchor of the region container (e.g. "app.guilds-layout.guild-list"). */
	anchor: string;
	/** Flex order within its parent. Lower = earlier. Undefined = leave as-is. */
	order?: number;
	/** Hide the region entirely. */
	hidden?: boolean;
	/** Explicit width in px for a fixed-basis region (sidebars). */
	widthPx?: number;
}

export interface Layout {
	/** Schema version so future changes can migrate old saved layouts. */
	version: 1;
	/** Human name shown in the editor's layout list. */
	name: string;
	/** CSS custom-property overrides, e.g. {"--accent-primary": "#8b5cf6"}. */
	tokens: Record<string, string>;
	/** Per-region layout tweaks, keyed by anchor. */
	regions: RegionTweak[];
}

export const DEFAULT_LAYOUT: Layout = {
	version: 1,
	name: 'Default',
	tokens: {},
	regions: [],
};

/** The major layout regions the simple editor exposes by default. Users can
 * additionally pick any element with a data-flx anchor via hover-select, but
 * these are the safe, meaningful ones to reorder/resize/hide. */
export const KNOWN_REGIONS: ReadonlyArray<{anchor: string; label: string}> = [
	// Anchor each region at the OUTERMOST visible DOM container, not an inner
	// element. GuildList/UserArea are prop-less observer components that DROP any
	// `data-flx` passed to them (see GuildsLayout.tsx) — the parent-level anchors
	// `…guild-list` and `…user-area` therefore match NO element, so hide/resize
	// silently no-op or only affect an inner child. The values below target the
	// components' own root nodes (the rail <nav>, the user-area wrapper <div>) and
	// the outer content panel, so hide/drag/resize act on the whole visible panel.
	{anchor: 'app.guilds-layout.guild-list.guild-list-scroller-wrapper', label: 'Server rail'},
	{anchor: 'app.guilds-layout.content-container', label: 'Main content'},
	{anchor: 'app.guilds-layout.user-area-wrapper', label: 'Profile card'},
];

const STYLE_ELEMENT_ID = 'ruxer-ui-editor-layout';
const STORAGE_KEY = 'ruxer.uiEditor.layouts.v1';
const ACTIVE_KEY = 'ruxer.uiEditor.activeLayout.v1';

function cssEscapeAttr(value: string): string {
	// data-flx values are dotted lowercase identifiers; still escape quotes/
	// backslashes defensively for the attribute selector.
	return value.replace(/["\\]/g, '\\$&');
}

/** Regions whose visible width/visibility is governed by a CSS Grid TRACK on
 * their parent (grid-template-columns), not by their own box. For these, a
 * `display:none` / `width` on the child alone leaves the grid column reserved
 * (an empty gap) and the child `width` loses to the track size — so we must
 * also drive the parent grid container's track variable. `containerSel` is the
 * grid parent; `widthVar` is the custom property that sizes the child's column.
 * See GuildsLayout.module.css `.guildsLayoutContainer` (grid-template-columns:
 * var(--layout-guild-list-width) …). */
const GRID_TRACK_REGIONS: Record<string, {containerSel: string; widthVar: string}> = {
	'app.guilds-layout.guild-list.guild-list-scroller-wrapper': {
		containerSel: '[data-flx="app.guilds-layout.guilds-layout"]',
		widthVar: '--layout-guild-list-width',
	},
};

/** Build the CSS text for a layout: token overrides on :root + per-region rules
 * targeting the `[data-flx="..."]` anchors. Returns a single stylesheet string. */
function layoutToCss(layout: Layout): string {
	const parts: string[] = [];

	const tokenLines = Object.entries(layout.tokens)
		.filter(([k]) => k.startsWith('--'))
		.map(([k, v]) => `${k}: ${v};`)
		.join(' ');
	if (tokenLines) {
		parts.push(`:root { ${tokenLines} }`);
	}

	for (const r of layout.regions) {
		const sel = `[data-flx="${cssEscapeAttr(r.anchor)}"]`;
		const decls: string[] = [];
		if (r.hidden) decls.push('display: none !important;');
		if (typeof r.order === 'number') decls.push(`order: ${r.order} !important;`);
		if (typeof r.widthPx === 'number') {
			decls.push(`flex: 0 0 ${r.widthPx}px !important;`);
			decls.push(`width: ${r.widthPx}px !important;`);
		}
		if (decls.length) parts.push(`${sel} { ${decls.join(' ')} }`);

		// Grid-track regions: the child rules above can't collapse/resize a grid
		// column on their own, so also drive the parent's track variable. Hiding
		// zeroes the track (no reserved gap); resizing sets it to the px width.
		const grid = GRID_TRACK_REGIONS[r.anchor];
		if (grid) {
			const gridDecls: string[] = [];
			if (r.hidden) gridDecls.push(`${grid.widthVar}: 0 !important;`);
			else if (typeof r.widthPx === 'number') gridDecls.push(`${grid.widthVar}: ${r.widthPx}px !important;`);
			if (gridDecls.length) parts.push(`${grid.containerSel} { ${gridDecls.join(' ')} }`);
		}
	}

	return parts.join('\n');
}

/** The engine is a singleton that owns the injected <style> and the current
 * layout. Editor UI and the LuaU bridge both call into it. */
class LayoutEngineImpl {
	private current: Layout = DEFAULT_LAYOUT;
	private listeners = new Set<(l: Layout) => void>();

	/** Apply a layout live. Does NOT persist — call `saveActive` to persist.
	 *
	 * CRITICAL: token overrides go as INLINE styles on <html>, NOT as a
	 * `:root {}` rule in a <style>. The app itself sets its runtime theme tokens
	 * via `document.documentElement.style.setProperty` (useThemeCssVariables) —
	 * and an inline style ALWAYS beats a `:root {}` stylesheet rule regardless of
	 * source order or specificity. A `<style>:root{--brand-primary:…}` therefore
	 * LOSES to the app's inline html vars, which is exactly why editing a color
	 * appeared to change nothing / revert. Setting them inline here wins. Region
	 * rules still need selectors (`[data-flx]`), so those stay in the <style>. */
	apply(layout: Layout): void {
		// Clear tokens from the previous layout that aren't in this one.
		const prevTokens = Object.keys(this.current.tokens ?? {});
		this.current = layout;
		for (const k of prevTokens) {
			if (!(k in layout.tokens)) document.documentElement.style.removeProperty(k);
		}
		for (const [k, v] of Object.entries(layout.tokens)) {
			if (k.startsWith('--')) document.documentElement.style.setProperty(k, v);
		}
		let style = document.getElementById(STYLE_ELEMENT_ID) as HTMLStyleElement | null;
		if (!style) {
			style = document.createElement('style');
			style.id = STYLE_ELEMENT_ID;
			document.head.appendChild(style);
		}
		// Only region rules in the stylesheet now (tokens are inline above).
		style.textContent = layoutToCss({...layout, tokens: {}});
		this.listeners.forEach((fn) => fn(layout));
	}

	/** Fast live-preview of a single token: sets it directly on :root's inline
	 * style, bypassing the stylesheet rebuild + listener notify that `apply`
	 * does. For a color picker dragged continuously this is the difference
	 * between one `setProperty` per tick (instant) and re-serializing the whole
	 * layout to CSS + a React re-render per tick (janky). The value still needs
	 * to be committed into the Layout via `apply`/`setToken` once the user
	 * settles (debounced) so it persists and survives the next full apply. */
	previewToken(name: string, value: string): void {
		if (name.startsWith('--')) {
			document.documentElement.style.setProperty(name, value);
		}
	}

	/** Fast live-preview of a region's width during a drag: patches the current
	 * layout's region tweak and re-applies just the stylesheet (no listener
	 * notify → no React re-render of the panel). Committed to saved state by the
	 * overlay's onChange when the drag ends. */
	previewRegionWidth(anchor: string, widthPx: number): void {
		this.patchRegionLive(anchor, {widthPx});
	}

	/** Fast live-preview of a region's flex order during a reorder drag. */
	previewRegionOrder(anchor: string, order: number): void {
		this.patchRegionLive(anchor, {order});
	}

	private patchRegionLive(anchor: string, patch: Partial<RegionTweak>): void {
		const regions = [...this.current.regions];
		const i = regions.findIndex((r) => r.anchor === anchor);
		if (i === -1) regions.push({anchor, ...patch});
		else regions[i] = {...regions[i], ...patch};
		this.current = {...this.current, regions};
		const style = document.getElementById(STYLE_ELEMENT_ID) as HTMLStyleElement | null;
		if (style) style.textContent = layoutToCss(this.current);
		// deliberately NO listener notify — keeps the drag off React's render path
	}

	/** Revert to the untouched shipped UI. */
	reset(): void {
		// Also clear any inline previewToken values left on :root.
		this.current.tokens && Object.keys(this.current.tokens).forEach((k) => document.documentElement.style.removeProperty(k));
		this.apply(DEFAULT_LAYOUT);
	}

	get(): Layout {
		return this.current;
	}

	subscribe(fn: (l: Layout) => void): () => void {
		this.listeners.add(fn);
		return () => this.listeners.delete(fn);
	}

	// --- persistence (local) ---------------------------------------------

	/** All saved layouts, keyed by name. */
	listSaved(): Record<string, Layout> {
		try {
			const raw = getProtectedLocalStorage()?.getItem(STORAGE_KEY);
			return raw ? (JSON.parse(raw) as Record<string, Layout>) : {};
		} catch {
			return {};
		}
	}

	save(layout: Layout): void {
		const all = this.listSaved();
		all[layout.name] = layout;
		try {
			getProtectedLocalStorage()?.setItem(STORAGE_KEY, JSON.stringify(all));
		} catch {
			/* storage full / blocked — layout stays applied for the session */
		}
	}

	delete(name: string): void {
		const all = this.listSaved();
		delete all[name];
		try {
			getProtectedLocalStorage()?.setItem(STORAGE_KEY, JSON.stringify(all));
		} catch {
			/* best effort */
		}
	}

	/** Persist which layout is active + apply it. */
	saveActive(layout: Layout): void {
		this.save(layout);
		try {
			getProtectedLocalStorage()?.setItem(ACTIVE_KEY, layout.name);
		} catch {
			/* best effort */
		}
		this.apply(layout);
	}

	/** Called once at startup to re-apply the user's last active layout. */
	restore(): void {
		try {
			const name = getProtectedLocalStorage()?.getItem(ACTIVE_KEY);
			if (!name) return;
			const layout = this.listSaved()[name];
			if (layout) this.apply(layout);
		} catch {
			/* no saved layout — ship default */
		}
	}

	/** Export the current layout as a pretty JSON string for sharing. */
	export(): string {
		return JSON.stringify(this.current, null, 2);
	}

	/** Import a layout from JSON text; validates the shape before applying. */
	import(json: string): Layout {
		const parsed = JSON.parse(json) as Partial<Layout>;
		if (parsed.version !== 1 || typeof parsed.name !== 'string') {
			throw new Error('Not a valid Ruxer layout file');
		}
		const layout: Layout = {
			version: 1,
			name: parsed.name,
			tokens: parsed.tokens && typeof parsed.tokens === 'object' ? parsed.tokens : {},
			regions: Array.isArray(parsed.regions) ? parsed.regions : [],
		};
		return layout;
	}
}

export const LayoutEngine = new LayoutEngineImpl();
