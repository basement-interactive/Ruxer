// Layout engine for the in-app UI editor. Applies a serializable "layout" — a
// set of design-token overrides plus per-region tweaks (order / visibility /
// width) — over the custom UI without touching component source. Regions are
// addressed by their stable `data-flx` anchors (added to the layout containers
// in web/src/layout/*), so the engine is a pure presentation layer: it injects
// a single <style> element and toggles inline <html> styles, and can be fully
// reverted at any time.
//
// This is the substrate both editor modes drive:
//   * simple mode   → color/spacing pickers + drag-to-reorder/resize regions
//   * advanced mode → LuaU scripts (run natively in Rust) emit the same ops
//
// Persistence is local (localStorage). The custom UI does NOT delete the global
// localStorage (the reference client did, needing a protected accessor), so the
// plain global is safe here.
//
// Ported from the reference client's ui_editor/LayoutEngine.ts and retargeted
// to the custom UI: flex layout (no CSS-grid track special-casing), the custom
// UI's data-flx anchors, and plain localStorage.

export interface RegionTweak {
  /** data-flx anchor of the region container (e.g. "app.guild-rail"). */
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
  /** CSS custom-property overrides, e.g. {"--brand-primary": "#8b5cf6"}. */
  tokens: Record<string, string>;
  /** Per-region layout tweaks, keyed by anchor. */
  regions: RegionTweak[];
}

export const DEFAULT_LAYOUT: Layout = {
  version: 1,
  name: "Default",
  tokens: {},
  regions: [],
};

/** The major layout regions the simple editor exposes. Users can additionally
 * hover-pick any element with a data-flx anchor, but these are the safe,
 * meaningful ones to reorder / resize / hide. They match the anchors added to
 * the custom UI's layout components (web/src/layout/*). The custom UI is
 * flex-based (app-layout-row is display:flex), so order/width/hide apply
 * directly to the child boxes — no CSS-grid track special-casing needed. */
export const KNOWN_REGIONS: ReadonlyArray<{ anchor: string; label: string }> = [
  { anchor: "app.guild-rail", label: "Server rail" },
  { anchor: "app.channel-sidebar", label: "Channel sidebar" },
  { anchor: "app.main-content", label: "Main content" },
  { anchor: "app.member-list", label: "Member list" },
  { anchor: "app.user-area", label: "Profile card" },
];

/** The color tokens the simple editor exposes by default, mapped to the custom
 * UI's actual CSS variable names (see web/src/theme.css). */
export const COLOR_TOKENS: ReadonlyArray<{ name: string; label: string }> = [
  { name: "--brand-primary", label: "Accent" },
  { name: "--bg-main", label: "Background" },
  { name: "--bg-panel", label: "Panels" },
  { name: "--bg-guild-rail", label: "Server rail" },
  { name: "--text-normal", label: "Text" },
  { name: "--text-muted", label: "Muted text" },
];

const STYLE_ELEMENT_ID = "ruxer-ui-editor-layout";
const STORAGE_KEY = "ruxer.uiEditor.layouts.v1";
const ACTIVE_KEY = "ruxer.uiEditor.activeLayout.v1";

function cssEscapeAttr(value: string): string {
  return value.replace(/["\\]/g, "\\$&");
}

/** Build the CSS text for a layout: per-region rules targeting the
 * `[data-flx="..."]` anchors. Token overrides are applied as inline <html>
 * styles (see apply), not here, so they beat the app's own inline theme vars. */
function layoutToCss(layout: Layout): string {
  const parts: string[] = [];
  for (const r of layout.regions) {
    const sel = `[data-flx="${cssEscapeAttr(r.anchor)}"]`;
    const decls: string[] = [];
    if (r.hidden) decls.push("display: none !important;");
    if (typeof r.order === "number") decls.push(`order: ${r.order} !important;`);
    if (typeof r.widthPx === "number") {
      decls.push(`flex: 0 0 ${r.widthPx}px !important;`);
      decls.push(`width: ${r.widthPx}px !important;`);
    }
    if (decls.length) parts.push(`${sel} { ${decls.join(" ")} }`);
  }
  return parts.join("\n");
}

/** The engine is a singleton that owns the injected <style> and the current
 * layout. Editor UI and the LuaU bridge both call into it. */
class LayoutEngineImpl {
  private current: Layout = DEFAULT_LAYOUT;
  private listeners = new Set<(l: Layout) => void>();

  /** Apply a layout live. Does NOT persist — call saveActive to persist.
   *
   * Token overrides go as INLINE styles on <html>, NOT a `:root {}` rule: the
   * app sets its runtime theme tokens via inline html vars, and an inline style
   * always beats a `:root {}` stylesheet rule — so a `<style>:root{...}` would
   * lose. Setting them inline here wins. Region rules still need selectors, so
   * those stay in the <style>. */
  apply(layout: Layout): void {
    const prevTokens = Object.keys(this.current.tokens ?? {});
    this.current = layout;
    for (const k of prevTokens) {
      if (!(k in layout.tokens)) document.documentElement.style.removeProperty(k);
    }
    for (const [k, v] of Object.entries(layout.tokens)) {
      if (k.startsWith("--")) document.documentElement.style.setProperty(k, v);
    }
    let style = document.getElementById(STYLE_ELEMENT_ID) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ELEMENT_ID;
      document.head.appendChild(style);
    }
    style.textContent = layoutToCss(layout);
    this.listeners.forEach((fn) => fn(layout));
  }

  /** Fast live-preview of a single token during a color-picker drag: one
   * setProperty per tick, bypassing the full apply + React re-render. Commit
   * via setToken/apply once the user settles so it persists. */
  previewToken(name: string, value: string): void {
    if (name.startsWith("--")) document.documentElement.style.setProperty(name, value);
  }

  /** Commit a token into the current layout (used after a debounced preview). */
  setToken(name: string, value: string): void {
    this.apply({ ...this.current, tokens: { ...this.current.tokens, [name]: value } });
  }

  previewRegionWidth(anchor: string, widthPx: number): void {
    this.patchRegionLive(anchor, { widthPx });
  }

  previewRegionOrder(anchor: string, order: number): void {
    this.patchRegionLive(anchor, { order });
  }

  setRegion(anchor: string, patch: Partial<RegionTweak>): void {
    const regions = [...this.current.regions];
    const i = regions.findIndex((r) => r.anchor === anchor);
    if (i === -1) regions.push({ anchor, ...patch });
    else regions[i] = { ...regions[i], ...patch };
    this.apply({ ...this.current, regions });
  }

  private patchRegionLive(anchor: string, patch: Partial<RegionTweak>): void {
    const regions = [...this.current.regions];
    const i = regions.findIndex((r) => r.anchor === anchor);
    if (i === -1) regions.push({ anchor, ...patch });
    else regions[i] = { ...regions[i], ...patch };
    this.current = { ...this.current, regions };
    const style = document.getElementById(STYLE_ELEMENT_ID) as HTMLStyleElement | null;
    if (style) style.textContent = layoutToCss(this.current);
    // deliberately NO listener notify — keeps the drag off React's render path
  }

  /** Revert to the untouched custom UI. */
  reset(): void {
    if (this.current.tokens) {
      Object.keys(this.current.tokens).forEach((k) =>
        document.documentElement.style.removeProperty(k),
      );
    }
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

  listSaved(): Record<string, Layout> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Record<string, Layout>) : {};
    } catch {
      return {};
    }
  }

  save(layout: Layout): void {
    const all = this.listSaved();
    all[layout.name] = layout;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch {
      /* storage full/blocked — layout stays applied for the session */
    }
  }

  delete(name: string): void {
    const all = this.listSaved();
    delete all[name];
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch {
      /* best effort */
    }
  }

  /** Persist which layout is active + apply it. */
  saveActive(layout: Layout): void {
    this.save(layout);
    try {
      localStorage.setItem(ACTIVE_KEY, layout.name);
    } catch {
      /* best effort */
    }
    this.apply(layout);
  }

  /** Called once at startup to re-apply the user's last active layout. */
  restore(): void {
    try {
      const name = localStorage.getItem(ACTIVE_KEY);
      if (!name) return;
      const layout = this.listSaved()[name];
      if (layout) this.apply(layout);
    } catch {
      /* no saved layout — ship default */
    }
  }

  export(): string {
    return JSON.stringify(this.current, null, 2);
  }

  import(json: string): Layout {
    const parsed = JSON.parse(json) as Partial<Layout>;
    if (parsed.version !== 1 || typeof parsed.name !== "string") {
      throw new Error("Not a valid Ruxer layout file");
    }
    return {
      version: 1,
      name: parsed.name,
      tokens: parsed.tokens && typeof parsed.tokens === "object" ? parsed.tokens : {},
      regions: Array.isArray(parsed.regions) ? parsed.regions : [],
    };
  }
}

export const LayoutEngine = new LayoutEngineImpl();
