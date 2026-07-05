// ContextMenu: a floating right-click menu rendered as an overlay. The UiStore
// owns the open state (items + anchor position); this component just renders
// it and closes on outside click / Escape / item click.

import { observer } from "mobx-react-lite";
import { useEffect, useRef } from "react";
import { ui } from "../stores";
import "./ContextMenu.css";

export const ContextMenu = observer(function ContextMenu() {
  const menu = ui.contextMenu;
  const ref = useRef<HTMLDivElement>(null);

  // Close on Escape.
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") ui.closeContextMenu();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu]);

  if (!menu) return null;

  // Clamp the menu within the viewport so it never overflows.
  const x = Math.min(menu.pos.x, window.innerWidth - 200);
  const y = Math.min(menu.pos.y, window.innerHeight - menu.items.length * 32 - 12);

  return (
    <div className="context-menu-overlay" onClick={() => ui.closeContextMenu()}>
      <div
        ref={ref}
        className="context-menu"
        style={{ left: x, top: y }}
        onClick={(e) => e.stopPropagation()}
      >
        {menu.items.map((item, i) => {
          if (item.kind === "separator") {
            return <div key={i} className="context-menu-separator" />;
          }
          if (item.kind === "checkbox") {
            // Toggle without closing the menu (matches the reference).
            return (
              <button
                key={i}
                className={`context-menu-item context-menu-checkbox ${item.danger ? "danger" : ""} ${item.disabled ? "disabled" : ""}`}
                disabled={item.disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!item.disabled) item.onToggle(!item.checked);
                }}
              >
                <span className={`context-menu-check ${item.checked ? "on" : ""}`} aria-hidden>
                  {item.checked ? "✓" : ""}
                </span>
                <span>{item.label}</span>
              </button>
            );
          }
          if (item.kind === "slider") {
            const fmt = item.format ?? ((v: number) => String(v));
            return (
              <div
                key={i}
                className="context-menu-slider"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="context-menu-slider-label">
                  <span>{item.label}</span>
                  <span className="context-menu-slider-value">{fmt(item.value)}</span>
                </div>
                <input
                  type="range"
                  min={item.min}
                  max={item.max}
                  value={item.value}
                  onChange={(e) => item.onChange(parseFloat(e.target.value))}
                />
              </div>
            );
          }
          return (
            <button
              key={i}
              className={`context-menu-item ${item.danger ? "danger" : ""} ${item.disabled ? "disabled" : ""}`}
              disabled={item.disabled}
              onClick={() => {
                item.onClick();
                ui.closeContextMenu();
              }}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
});