// ToastContainer: renders the stack of active toasts in the bottom-right
// corner. Each toast auto-dismisses when its `expiresAt` deadline passes; a
// purge timer ticks every 500ms. Clicking a toast dismisses it immediately.

import { observer } from "mobx-react-lite";
import { useEffect } from "react";
import { toasts } from "../stores";
import type { ToastKind } from "../stores";
import "./ToastContainer.css";

export const ToastContainer = observer(function ToastContainer() {
  // Purge expired toasts on a timer so the stack doesn't grow unbounded.
  useEffect(() => {
    const t = setInterval(() => toasts.purgeExpired(), 500);
    return () => clearInterval(t);
  }, []);

  if (toasts.toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.toasts.map((t) => (
        <div
          key={t.id}
          className={`toast toast-${t.kind}`}
          onClick={() => toasts.dismiss(t.id)}
          role="alert"
        >
          <div className="toast-icon">{iconFor(t.kind)}</div>
          <div className="toast-content">
            <div className="toast-title">{t.title}</div>
            {t.body && <div className="toast-body muted small">{t.body}</div>}
          </div>
          <button
            className="toast-close"
            title="Dismiss"
            onClick={(e) => {
              e.stopPropagation();
              toasts.dismiss(t.id);
            }}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
});

function iconFor(kind: ToastKind) {
  switch (kind) {
    case "error":
      return <ErrorIcon />;
    case "warn":
      return <WarnIcon />;
    case "success":
      return <SuccessIcon />;
    case "info":
    default:
      return <InfoIcon />;
  }
}

function ErrorIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-1 5h2v7h-2V7zm0 9h2v2h-2v-2z" />
    </svg>
  );
}
function WarnIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
    </svg>
  );
}
function SuccessIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-1.4 14.6L6.4 12.4l1.4-1.4 2.8 2.8 5.6-5.6 1.4 1.4-7 7z" />
    </svg>
  );
}
function InfoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-1 5h2v2h-2V7zm0 4h2v7h-2v-7z" />
    </svg>
  );
}