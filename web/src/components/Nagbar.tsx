// Nagbar stack: the top-of-app announcement bars (Fluxer/Discord "nagbars").
//
// A single, store-driven, prioritized, dismissible stack that replaces the old
// one-off gateway banner in AppLayout. Each bar is derived from live observable
// state, so bars appear/disappear on their own:
//   1. Connection status (non-dismissible) — highest priority.
//   2. Unverified email (dismissible).
//   3. Desktop notifications not yet enabled (dismissible).
//
// Dismissals persist per-id via UiStore (localStorage). Add a new bar by
// pushing another entry in `activeNagbars()`.

import { observer } from "mobx-react-lite";
import { ui, session } from "../stores";
import "./Nagbar.css";

type NagbarKind = "info" | "warn" | "danger" | "success";

interface NagbarDef {
  id: string;
  kind: NagbarKind;
  message: string;
  action?: { label: string; onClick: () => void };
  dismissible: boolean;
}

function activeNagbars(): NagbarDef[] {
  const bars: NagbarDef[] = [];

  // 1. Connection status — non-dismissible, always first.
  const gs = ui.gatewayStatus;
  if (gs === "reconnecting") {
    bars.push({
      id: "conn",
      kind: "warn",
      message: "Connection lost — reconnecting…",
      dismissible: false,
    });
  } else if (gs === "connecting") {
    bars.push({
      id: "conn",
      kind: "warn",
      message: "Connecting…",
      dismissible: false,
    });
  } else if (gs === "disconnected") {
    bars.push({
      id: "conn",
      kind: "danger",
      message: "You're disconnected. Trying to restore your connection…",
      dismissible: false,
    });
  }

  // 2. Unverified email. Only when the server explicitly says verified === false
  // (undefined = unknown → no nag, avoids false positives before /me loads).
  if (
    session.me &&
    session.me.verified === false &&
    !ui.isNagbarDismissed("verify-email")
  ) {
    bars.push({
      id: "verify-email",
      kind: "warn",
      message: "Your email address is unverified. Verify it to secure your account.",
      action: { label: "Open settings", onClick: () => ui.openSettings() },
      dismissible: true,
    });
  }

  // 3. Desktop notifications not yet granted.
  if (ui.notifPermission === "default" && !ui.isNagbarDismissed("enable-notifs")) {
    bars.push({
      id: "enable-notifs",
      kind: "info",
      message: "Enable desktop notifications so you don't miss mentions and messages.",
      action: { label: "Enable", onClick: () => ui.requestNotifPermission() },
      dismissible: true,
    });
  }

  return bars;
}

export const NagbarStack = observer(function NagbarStack() {
  const bars = activeNagbars();
  if (bars.length === 0) return null;
  return (
    <div className="nagbar-stack" role="region" aria-label="Announcements">
      {bars.map((b) => (
        <div key={b.id} className={`nagbar nagbar-${b.kind}`} role="status">
          <span className="nagbar-msg">{b.message}</span>
          {b.action && (
            <button
              type="button"
              className="nagbar-action"
              onClick={b.action.onClick}
            >
              {b.action.label}
            </button>
          )}
          {b.dismissible && (
            <button
              type="button"
              className="nagbar-dismiss"
              aria-label="Dismiss"
              title="Dismiss"
              onClick={() => ui.dismissNagbar(b.id)}
            >
              ×
            </button>
          )}
        </div>
      ))}
    </div>
  );
});
