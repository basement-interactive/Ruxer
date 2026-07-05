// Custom window titlebar. The Tauri window is frameless (decorations(false)
// in src-tauri/src/lib.rs), so the custom UI draws its own titlebar: a drag
// region (via `data-tauri-drag-region`) plus minimize / maximize / close
// controls wired to the Tauri window API. Mirrors the reference client's
// NativeTitlebar visually (72px-tall guild rail aside, 2rem titlebar height,
// Windows-style controls with a red close hover).

import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./TitleBar.css";

export function TitleBar() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const win = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    // Track maximize state so the middle button shows the right glyph.
    win.isMaximized().then(setMaximized).catch(() => {});
    win
      .onResized(() => {
        win.isMaximized().then(setMaximized).catch(() => {});
      })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => {});
    return () => unlisten?.();
  }, []);

  const win = getCurrentWindow();

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
          onClick={() => win.minimize().catch(() => {})}
        >
          <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
            <rect x="2" y="5.5" width="8" height="1" fill="currentColor" />
          </svg>
        </button>
        <button
          className="titlebar-btn"
          aria-label={maximized ? "Restore" : "Maximize"}
          onClick={() => win.toggleMaximize().catch(() => {})}
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
          onClick={() => win.close().catch(() => {})}
        >
          <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
            <path d="M2.5 2.5L9.5 9.5M9.5 2.5L2.5 9.5" stroke="currentColor" strokeWidth="1.1" />
          </svg>
        </button>
      </div>
    </div>
  );
}
