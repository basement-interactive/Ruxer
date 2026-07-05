// ThemeStudio: a lightweight custom-theme editor. Exposes the core design
// tokens as color pickers, generates a `:root` CSS override, applies it live
// via a <style> element, persists it to localStorage, and (optionally) saves it
// to the account via POST /users/@me/themes.
//
// Self-authored: it drives the existing token system in theme.css rather than
// shipping any reference theme data.

import { observer } from "mobx-react-lite";
import { useEffect, useState } from "react";
import { ui, toasts } from "../stores";
import { api } from "../api";
import "./ThemeStudio.css";

// The tokens surfaced in the editor, with sensible dark-theme defaults used as
// the initial picker value when no custom value is stored.
const TOKENS: { var: string; label: string; fallback: string }[] = [
  { var: "--brand", label: "Accent", fallback: "#5865f2" },
  { var: "--bg-panel", label: "Panel Background", fallback: "#313338" },
  { var: "--bg-elevated", label: "Elevated Background", fallback: "#2b2d31" },
  { var: "--bg-input", label: "Input Background", fallback: "#1e1f22" },
  { var: "--text-bright", label: "Bright Text", fallback: "#f2f3f5" },
  { var: "--text-normal", label: "Normal Text", fallback: "#dbdee1" },
  { var: "--text-muted", label: "Muted Text", fallback: "#949ba4" },
  { var: "--green", label: "Online / Success", fallback: "#23a55a" },
  { var: "--yellow", label: "Idle / Warning", fallback: "#f0b232" },
  { var: "--red", label: "DND / Danger", fallback: "#f23f43" },
];

const STORAGE_KEY = "ui.customThemeVars";
const STYLE_ID = "custom-theme";

// Read the persisted overrides ({ "--brand": "#abcdef", ... }).
function loadVars(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

// Build a `:root { --x: y; }` block from the override map.
function buildCss(vars: Record<string, string>): string {
  const decls = Object.entries(vars)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join("\n");
  return decls ? `:root {\n${decls}\n}` : "";
}

// Apply (or clear) the custom-theme <style> element.
export function applyCustomTheme(vars: Record<string, string>): void {
  if (typeof document === "undefined") return;
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  const css = buildCss(vars);
  if (!css) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement("style");
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = css;
}

// Re-apply the persisted theme on app start (called from AppLayout).
export function initCustomTheme(): void {
  applyCustomTheme(loadVars());
}

export const ThemeStudio = observer(function ThemeStudio() {
  const [vars, setVars] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (ui.themeStudioOpen) setVars(loadVars());
  }, [ui.themeStudioOpen]);

  if (!ui.themeStudioOpen) return null;

  const setVar = (name: string, value: string) => {
    const next = { ...vars, [name]: value };
    setVars(next);
    applyCustomTheme(next); // live preview
  };

  const persist = (next: Record<string, string>) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}
  };

  const save = async () => {
    persist(vars);
    setBusy(true);
    try {
      await api.saveTheme(buildCss(vars));
      toasts.success("Theme saved");
    } catch (e) {
      // The local theme still applies even if the server save fails.
      toasts.warn("Theme applied locally; server save failed", String(e));
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setVars({});
    applyCustomTheme({});
    persist({});
    toasts.info("Theme reset to default");
  };

  const close = () => {
    // Re-apply the last persisted theme so an unsaved preview doesn't linger.
    applyCustomTheme(loadVars());
    ui.closeThemeStudio();
  };

  return (
    <div className="ts-overlay" onClick={close}>
      <div className="ts-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ts-header">
          <h2 className="ts-title">Theme Studio</h2>
          <button className="ts-close" onClick={close} title="Close">
            ✕
          </button>
        </div>
        <p className="ts-help muted small">
          Customize the core colors. Changes preview live; Save stores the theme
          to your account.
        </p>
        <div className="ts-grid">
          {TOKENS.map((tk) => (
            <label key={tk.var} className="ts-row">
              <span className="ts-row-label">{tk.label}</span>
              <input
                type="color"
                className="ts-color"
                value={vars[tk.var] ?? tk.fallback}
                onChange={(e) => setVar(tk.var, e.target.value)}
              />
            </label>
          ))}
        </div>
        <div className="ts-actions">
          <button className="ts-reset" onClick={reset} disabled={busy}>
            Reset
          </button>
          <button className="ts-save" onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save Theme"}
          </button>
        </div>
      </div>
    </div>
  );
});
