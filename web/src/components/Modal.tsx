// Modal — ported from the real Fluxer client to produce identical visuals.
// Source: reference/fluxer/fluxer_app/src/features/app/components/dialogs/Modal.module.css
// + Modal.tsx (the dialog host).
//
// Re-authored clean (not AGPL-copied) but with every design value traced to the
// source file:line. The real client uses a layered backdrop + Radix/floating-ui
// focus-lock; we use a plain fixed overlay + a centered panel — the rendered
// anatomy + measurements + colors match the source exactly.
//
// Sizes: small (27.5rem), medium (37.5rem), large (50rem), xlarge, fullscreen.
// Layout: header (title + close), scrollable content, footer (action buttons).

import React, { useEffect } from "react";
import "./Modal.css";

export type ModalSize = "small" | "medium" | "large" | "xlarge" | "fullscreen";

export interface ModalProps {
  open: boolean;
  onClose?: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  size?: ModalSize;
  footer?: React.ReactNode;
  children?: React.ReactNode;
  /** When true, the close (✕) button is shown in the header. Default true. */
  showClose?: boolean;
  /** Clicking the backdrop closes the modal. Default true. */
  closeOnBackdrop?: boolean;
  /** Escape closes the modal. Default true. */
  closeOnEscape?: boolean;
  className?: string;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  size = "medium",
  footer,
  children,
  showClose = true,
  closeOnBackdrop = true,
  closeOnEscape = true,
  className,
}: ModalProps) {
  // Escape to close (Modal.module.css has no escape handler in CSS; the source
  // component wires it via the dialog host. We wire it here for parity.)
  useEffect(() => {
    if (!open || !closeOnEscape) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closeOnEscape, onClose]);

  if (!open) return null;

  return (
    <div className="flx-modal-layer">
      {/* Backdrop (Modal.module.css:3-8 backdrop, :37-41 backdropCentered) */}
      <div
        className="flx-modal-backdrop flx-modal-backdrop--centered"
        onClick={() => { if (closeOnBackdrop) onClose?.(); }}
      />
      {/* Root panel (Modal.module.css:124-169) */}
      <div className={`flx-modal-root flx-modal-root--${size} ${className ?? ""}`}>
        {/* Header (Modal.module.css:268-391) */}
        {(title || description || showClose) && (
          <div className="flx-modal-layout flx-modal-layout--header">
            <div className="flx-modal-headerInner">
              <div className="flx-modal-headerText">
                {title && <h3 className="flx-modal-headerTitle">{title}</h3>}
              </div>
              {showClose && (
                <button
                  className="flx-modal-closeBtn"
                  onClick={() => onClose?.()}
                  aria-label="Close"
                >
                  <CloseIcon />
                </button>
              )}
            </div>
            {description && <div className="flx-modal-description">{description}</div>}
          </div>
        )}
        {/* Content (Modal.module.css:393-404) */}
        <div className="flx-modal-content">{children}</div>
        {/* Footer (Modal.module.css:291-339) */}
        {footer && (
          <div className="flx-modal-layout flx-modal-layout--footer">{footer}</div>
        )}
      </div>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}