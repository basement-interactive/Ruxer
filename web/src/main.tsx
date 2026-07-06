// React entry point. Mounts the app and starts the gateway listener.

// MUST be first: in browser dev (no Tauri) this installs a fake backend so the
// UI runs standalone. Inert under `cargo tauri dev` and stripped from prod.
import "./dev/mockTauri";
import React from "react";
import { createRoot } from "react-dom/client";
import { observer } from "mobx-react-lite";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { session, startGatewayListener, startLogListener } from "./stores";
// The Fluxer-accurate design tokens (ported 1:1 from the real client source).
// Imported before theme.css so the canonical Fluxer variables are available;
// legacy --sp-*/--bg-* tokens in theme.css remain for not-yet-migrated components.
import "./styles/tokens.css";
import "./theme.css";

const Root = observer(function Root() {
  // Mirror backend tracing records into the devtools console. Started once
  // on mount and kept running for the whole session (backend logs flow even
  // before login).
  React.useEffect(() => {
    startLogListener();
  }, []);

  // Start listening for gateway events once we're logged in.
  React.useEffect(() => {
    if (session.isLoggedIn) {
      startGatewayListener();
    }
  }, [session.isLoggedIn]);

  // DEV-only: drive the app into a screenshot scene via ?devscene=… (no-op in
  // production and under a real backend).
  React.useEffect(() => {
    void import("./dev/devScenes").then((m) => m.applyDevScene());
  }, []);

  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
});

const root = createRoot(document.getElementById("root")!);
root.render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);