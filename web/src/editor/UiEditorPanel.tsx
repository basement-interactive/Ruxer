// The in-app UI editor panel. A floating dock that edits the active Layout live
// through the ported LayoutEngine.
//
//   * Simple mode  — color-token swatches + reorder / resize / hide the major
//                    regions. Every change applies instantly.
//   * Advanced mode— a LuaU code editor; running the script produces a Layout
//                    via the Rust sandbox (api.uiEditorRunLua) and applies it.
//   * Reset        — one click reverts to the default custom UI.
//
// Layouts persist locally (LayoutEngine) and can be exported/imported as JSON.
// Retargeted from the reference client's UiEditorPanel to the custom UI's
// tokens (COLOR_TOKENS), anchors (KNOWN_REGIONS), and flex layout.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  COLOR_TOKENS,
  DEFAULT_LAYOUT,
  KNOWN_REGIONS,
  LayoutEngine,
  type Layout,
} from "./LayoutEngine";
import { DEFAULT_LUA_SCRIPT, runLuaLayout } from "./LuaBridge";
import "./UiEditorPanel.css";

function readComputedToken(token: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  // Color inputs need #rrggbb; non-hex theme values fall back to a neutral.
  return /^#[0-9a-f]{6}$/i.test(v) ? v : "#000000";
}

type Mode = "simple" | "advanced";

export function UiEditorPanel({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<Mode>("simple");
  const [layout, setLayout] = useState<Layout>(() => {
    const current = LayoutEngine.get();
    return current.name === "Default" ? { ...DEFAULT_LAYOUT, name: "My layout" } : current;
  });
  const [script, setScript] = useState(DEFAULT_LUA_SCRIPT);
  const [luaError, setLuaError] = useState<string | null>(null);

  // Apply the FULL layout when it changes (regions / committed tokens). Live
  // color dragging bypasses this via LayoutEngine.previewToken.
  useEffect(() => {
    LayoutEngine.apply(layout);
  }, [layout]);

  // Debounce committing a token: the color picker fires per pixel; preview
  // instantly, fold the settled value into layout state so it persists.
  const commitTimer = useRef<number | undefined>(undefined);
  const setTokenLive = useCallback((token: string, value: string) => {
    LayoutEngine.previewToken(token, value);
    window.clearTimeout(commitTimer.current);
    commitTimer.current = window.setTimeout(() => {
      setLayout((l) => ({ ...l, tokens: { ...l.tokens, [token]: value } }));
    }, 150);
  }, []);

  const regionTweak = (anchor: string) =>
    layout.regions.find((r) => r.anchor === anchor);

  const setRegion = (anchor: string, patch: Partial<{ hidden: boolean; widthPx: number; order: number }>) => {
    setLayout((l) => {
      const regions = [...l.regions];
      const i = regions.findIndex((r) => r.anchor === anchor);
      if (i === -1) regions.push({ anchor, ...patch });
      else regions[i] = { ...regions[i], ...patch };
      return { ...l, regions };
    });
  };

  const moveRegion = (anchor: string, dir: -1 | 1) => {
    // Assign explicit orders to all known regions, then swap this one.
    const ordered = KNOWN_REGIONS.map((r, idx) => ({
      anchor: r.anchor,
      order: regionTweak(r.anchor)?.order ?? idx,
    })).sort((a, b) => a.order - b.order);
    const pos = ordered.findIndex((r) => r.anchor === anchor);
    const swap = pos + dir;
    if (swap < 0 || swap >= ordered.length) return;
    [ordered[pos].order, ordered[swap].order] = [ordered[swap].order, ordered[pos].order];
    setLayout((l) => {
      const regions = [...l.regions];
      for (const o of ordered) {
        const i = regions.findIndex((r) => r.anchor === o.anchor);
        if (i === -1) regions.push({ anchor: o.anchor, order: o.order });
        else regions[i] = { ...regions[i], order: o.order };
      }
      return { ...l, regions };
    });
  };

  const runScript = async () => {
    const res = await runLuaLayout(script, layout.name);
    if (!res.ok || !res.layout) {
      setLuaError(res.error ?? "Script failed.");
      return;
    }
    setLuaError(null);
    setLayout(res.layout);
  };

  const save = () => {
    LayoutEngine.saveActive(layout);
  };

  const reset = () => {
    LayoutEngine.reset();
    setLayout({ ...DEFAULT_LAYOUT, name: "My layout" });
  };

  const exportLayout = () => {
    const blob = new Blob([LayoutEngine.export()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${layout.name || "layout"}.ruxerlayout.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importLayout = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = LayoutEngine.import(String(reader.result));
        setLayout(imported);
      } catch (e) {
        setLuaError(String(e));
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="ui-editor-panel" data-flx="app.ui-editor">
      <div className="ui-editor-header">
        <span className="ui-editor-title">UI Editor</span>
        <div className="ui-editor-tabs">
          <button
            className={mode === "simple" ? "active" : ""}
            onClick={() => setMode("simple")}
          >
            Simple
          </button>
          <button
            className={mode === "advanced" ? "active" : ""}
            onClick={() => setMode("advanced")}
          >
            Advanced
          </button>
        </div>
        <button className="ui-editor-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>

      {mode === "simple" ? (
        <div className="ui-editor-body">
          <section>
            <h4>Colors</h4>
            <div className="ui-editor-swatches">
              {COLOR_TOKENS.map((t) => (
                <label key={t.name} className="ui-editor-swatch">
                  <input
                    type="color"
                    defaultValue={layout.tokens[t.name] ?? readComputedToken(t.name)}
                    onChange={(e) => setTokenLive(t.name, e.target.value)}
                  />
                  <span>{t.label}</span>
                </label>
              ))}
            </div>
          </section>

          <section>
            <h4>Layout regions</h4>
            <div className="ui-editor-regions">
              {KNOWN_REGIONS.map((r) => {
                const tweak = regionTweak(r.anchor);
                return (
                  <div key={r.anchor} className="ui-editor-region">
                    <span className="ui-editor-region-label">{r.label}</span>
                    <div className="ui-editor-region-controls">
                      <button title="Move up" onClick={() => moveRegion(r.anchor, -1)}>
                        ↑
                      </button>
                      <button title="Move down" onClick={() => moveRegion(r.anchor, 1)}>
                        ↓
                      </button>
                      <input
                        type="number"
                        className="ui-editor-width"
                        placeholder="auto"
                        min={0}
                        max={600}
                        value={tweak?.widthPx ?? ""}
                        onChange={(e) =>
                          setRegion(
                            r.anchor,
                            e.target.value === ""
                              ? { widthPx: undefined }
                              : { widthPx: Number(e.target.value) },
                          )
                        }
                      />
                      <label className="ui-editor-hide">
                        <input
                          type="checkbox"
                          checked={tweak?.hidden ?? false}
                          onChange={(e) => setRegion(r.anchor, { hidden: e.target.checked })}
                        />
                        Hide
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      ) : (
        <div className="ui-editor-body">
          <section>
            <h4>LuaU script</h4>
            <textarea
              className="ui-editor-lua"
              value={script}
              spellCheck={false}
              onChange={(e) => setScript(e.target.value)}
            />
            {luaError && <div className="ui-editor-error">{luaError}</div>}
            <button className="ui-editor-run" onClick={runScript}>
              Run script
            </button>
          </section>
        </div>
      )}

      <div className="ui-editor-footer">
        <input
          className="ui-editor-name"
          value={layout.name}
          onChange={(e) => setLayout((l) => ({ ...l, name: e.target.value }))}
          placeholder="Layout name"
        />
        <button onClick={save}>Save</button>
        <button onClick={exportLayout}>Export</button>
        <label className="ui-editor-import">
          Import
          <input
            type="file"
            accept=".json,.ruxerlayout.json"
            hidden
            onChange={(e) => e.target.files?.[0] && importLayout(e.target.files[0])}
          />
        </label>
        <button className="ui-editor-reset" onClick={reset}>
          Reset
        </button>
      </div>
    </div>
  );
}
