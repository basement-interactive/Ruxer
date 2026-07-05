// Root app component. Renders the login view until authenticated, then the
// full Discord/Fluxer-style 3-column layout. On first mount it attempts a
// silent session restore from the OS keychain (secure-storage build only).
//
// Identity media (avatars, guild icons, emoji) is pre-cached in the BACKGROUND
// after login so the cache is warm, but the layout is shown immediately — every
// <img> resolves its asset:// URL lazily via useMediaUrl, so the shell paints
// at once and media fills in progressively (no full-screen preload gate).

import { observer } from "mobx-react-lite";
import { useEffect, useRef, useState } from "react";
import { session, toasts, preloadIdentityMedia } from "./stores";
import { api } from "./api";
import { LoginView } from "./views/LoginView";
import { AppLayout } from "./layout/AppLayout";
import { TitleBar } from "./layout/TitleBar";
import { UiEditorGate } from "./editor/UiEditorGate";

export const App = observer(function App() {
  // `restoring` is true while we check the keychain for a saved session. We
  // keep it true through the restore attempt so we don't flash the login view
  // before the keychain lookup finishes.
  const [restoring, setRestoring] = useState(true);
  // Guards the background preload so it runs exactly once per login session.
  const preloadStarted = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const has = await api.hasStoredSession();
        if (!has || cancelled) return;
        const stored = await api.restoreSession();
        if (!stored || cancelled) return;
        // Re-run login with the stored credentials. Discovery + bootstrap are
        // re-run server-side so the restored session is fresh.
        await session.login(stored.token, stored.kind, {
          instance: stored.instance || undefined,
        });
      } catch (e) {
        // Restore failed (e.g. token revoked) — fall through to the login view.
        toasts.warn("Session restore failed", String(e));
      } finally {
        if (!cancelled) setRestoring(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Warm the identity-media cache in the background once logged in. Does NOT
  // block rendering — the layout is already visible while this runs.
  useEffect(() => {
    if (session.isLoggedIn && !preloadStarted.current) {
      preloadStarted.current = true;
      preloadIdentityMedia().catch(() => {});
    } else if (!session.isLoggedIn) {
      preloadStarted.current = false;
    }
  }, [session.isLoggedIn]);

  const content =
    restoring && !session.isLoggedIn ? (
      <LoadingScreen />
    ) : !session.isLoggedIn ? (
      <LoginView />
    ) : (
      <AppLayout />
    );
  // The frameless window draws its own titlebar at the very top; the app content
  // sits below it, offset by --native-titlebar-height.
  return (
    <>
      <TitleBar />
      <div className="app-below-titlebar">{content}</div>
      <UiEditorGate />
    </>
  );
});

function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="loading-screen-logo">fluxer</div>
      <div className="loading-screen-spinner" />
    </div>
  );
}