// Custom window titlebar. The Tauri window is frameless (decorations(false)
// in src-tauri/src/lib.rs), so the custom UI draws its own titlebar: a drag
// region (via `data-tauri-drag-region`) plus minimize / maximize / close
// controls wired to the Tauri window API. Mirrors the reference client's
// NativeTitlebar visually (72px-tall guild rail aside, 2rem titlebar height,
// Windows-style controls with a red close hover).

import { useEffect, useState } from "react";
import type { Window } from "@tauri-apps/api/window";
import "./TitleBar.css";

// Resolve the Tauri window lazily and defensively: `getCurrentWindow()` throws
// outside a Tauri webview (e.g. a plain-browser vite preview) and may not be
// ready at first paint. Returning null there lets the titlebar still render;
// the controls simply no-op. Never let this crash the whole app.
async function tauriWindow(): Promise<Window | null> {
  try {
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
      return null;
    }
    const mod = await import("@tauri-apps/api/window");
    return mod.getCurrentWindow();
  } catch {
    return null;
  }
}

export function TitleBar() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    (async () => {
      const win = await tauriWindow();
      if (!win || disposed) return;
      win.isMaximized().then(setMaximized).catch(() => {});
      const fn = await win
        .onResized(() => {
          win.isMaximized().then(setMaximized).catch(() => {});
        })
        .catch(() => undefined);
      if (disposed) fn?.();
      else unlisten = fn ?? undefined;
    })();
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  const ctl = (fn: (w: Window) => Promise<unknown>) => () => {
    tauriWindow().then((w) => (w ? fn(w) : undefined)).catch(() => {});
  };

  return (
    <div className="titlebar" data-tauri-drag-region data-flx="app.titlebar">
      <div className="titlebar-left" data-tauri-drag-region>
        <span className="titlebar-wordmark">Ruxer</span>
      </div>
      <div className="titlebar-spacer" data-tauri-drag-region />
      <div className="titlebar-controls">
        <button
          className="titlebar-btn"
          aria-label="Minimize"
          onClick={ctl((w) => w.minimize())}
        >
          <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
            <rect x="2" y="5.5" width="8" height="1" fill="currentColor" />
          </svg>
        </button>
        <button
          className="titlebar-btn"
          aria-label={maximized ? "Restore" : "Maximize"}
          onClick={ctl((w) => w.toggleMaximize())}
        >
          {maximized ? (
            <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
              <rect x="2.5" y="3.5" width="6" height="6" fill="none" stroke="currentColor" strokeWidth="1" />
              <path d="M4 3.5V2.5H9.5V8H8.5" fill="none" stroke="currentColor" strokeWidth="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
              <rect x="2.5" y="2.5" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1" />
            </svg>
          )}
        </button>
        <button
          className="titlebar-btn titlebar-btn-close"
          aria-label="Close"
          onClick={ctl((w) => w.close())}
        >
          <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
            <path d="M2.5 2.5L9.5 9.5M9.5 2.5L2.5 9.5" stroke="currentColor" strokeWidth="1.1" />
          </svg>
        </button>
      </div>
    </div>
  );
}
