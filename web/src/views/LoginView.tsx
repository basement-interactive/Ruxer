// Login view: a centered card with token and email/password tabs. Matches
// Discord's login aesthetic (dark, centered, brand accent button). The
// Password tab (E.23) runs the email/password → (MFA?) → session-token
// flow, then bootstraps the full client via session.login.

import { observer } from "mobx-react-lite";
import { useState } from "react";
import { session } from "../stores";
import "./LoginView.css";

type Tab = "token" | "password";

export const LoginView = observer(function LoginView() {
  const [tab, setTab] = useState<Tab>("password");

  // Shared advanced fields.
  const [instance, setInstance] = useState("fluxer.app");
  const [apiBase, setApiBase] = useState("");
  const [gatewayUrl, setGatewayUrl] = useState("");
  const [cdnBase, setCdnBase] = useState("");

  // Token-tab state.
  const [token, setToken] = useState("");
  const [kind, setKind] = useState<"session" | "bot" | "bearer">("session");

  // Password-tab state.
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // MFA challenge state (set when loginWithCredentials returns an MFA
  // challenge; the user enters their TOTP code and we call completeMfa).
  const [mfa, setMfa] = useState<{
    ticket: string;
    totp: boolean;
    webauthn: boolean;
  } | null>(null);
  const [totpCode, setTotpCode] = useState("");

  const sharedOpts = {
    instance: instance.trim() || undefined,
    apiBase: apiBase.trim() || undefined,
    gatewayUrl: gatewayUrl.trim() || undefined,
    cdnBase: cdnBase.trim() || undefined,
  };

  const submitToken = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await session.login(token.trim(), kind, sharedOpts);
    } catch {}
  };

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await session.loginWithCredentials(
        email.trim(),
        password,
        sharedOpts,
      );
      if (res.kind === "mfa") {
        setMfa({ ticket: res.ticket, totp: res.totp, webauthn: res.webauthn });
        setTotpCode("");
      }
    } catch {}
  };

  const submitTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfa) return;
    try {
      await session.completeMfa(mfa.ticket, totpCode.trim(), sharedOpts);
    } catch {}
  };

  // --- MFA challenge sub-view ---
  if (mfa) {
    return (
      <div className="login-root">
        <form className="login-card" onSubmit={submitTotp}>
          <div className="login-brand">fluxer</div>
          <div className="login-sub">Two-factor authentication</div>
          <div className="login-mfa-hint">
            Enter the 6-digit code from your authenticator app.
          </div>
          <label className="login-field">
            <span className="login-label">Authenticator code</span>
            <input
              className="login-input"
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\s/g, ""))}
              placeholder="000000"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={8}
              autoFocus
            />
          </label>
          {session.loginError && (
            <div className="login-error">✗ {session.loginError}</div>
          )}
          <div className="login-mfa-actions">
            <button
              type="button"
              className="login-back"
              onClick={() => {
                setMfa(null);
                setTotpCode("");
                session.setLoginError(null);
              }}
            >
              Back
            </button>
            <button
              className="login-submit"
              type="submit"
              disabled={session.loggingIn || totpCode.trim().length < 6}
            >
              {session.loggingIn ? "Verifying…" : "Verify"}
            </button>
          </div>
        </form>
      </div>
    );
  }

  // --- Main login (tabs) ---
  return (
    <div className="login-root">
      <form className="login-card" onSubmit={tab === "token" ? submitToken : submitPassword}>
        <div className="login-brand">fluxer</div>
        <div className="login-sub">Sign in to continue</div>

        <div className="login-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            className={"login-tab" + (tab === "password" ? " active" : "")}
            onClick={() => setTab("password")}
          >
            Password
          </button>
          <button
            type="button"
            role="tab"
            className={"login-tab" + (tab === "token" ? " active" : "")}
            onClick={() => setTab("token")}
          >
            Token
          </button>
        </div>

        {tab === "password" ? (
          <>
            <label className="login-field">
              <span className="login-label">Email</span>
              <input
                className="login-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoFocus
              />
            </label>
            <label className="login-field">
              <span className="login-label">Password</span>
              <input
                className="login-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </label>
          </>
        ) : (
          <>
            <label className="login-field">
              <span className="login-label">Token</span>
              <input
                className="login-input"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="session / bot / bearer token"
                autoFocus
              />
            </label>
            <div className="login-field">
              <span className="login-label">Token type</span>
              <div className="login-radios">
                {(["session", "bot", "bearer"] as const).map((k) => (
                  <label key={k} className="login-radio">
                    <input
                      type="radio"
                      name="kind"
                      checked={kind === k}
                      onChange={() => setKind(k)}
                    />
                    <span>{k}</span>
                  </label>
                ))}
              </div>
            </div>
          </>
        )}

        <details className="login-advanced">
          <summary>Advanced</summary>
          <label className="login-field">
            <span className="login-label">Instance domain</span>
            <input
              className="login-input"
              value={instance}
              onChange={(e) => setInstance(e.target.value)}
              placeholder="fluxer.app"
            />
          </label>
          <label className="login-field">
            <span className="login-label">API base</span>
            <input
              className="login-input"
              value={apiBase}
              onChange={(e) => setApiBase(e.target.value)}
              placeholder="https://api.fluxer.app/v1"
            />
          </label>
          <label className="login-field">
            <span className="login-label">Gateway URL</span>
            <input
              className="login-input"
              value={gatewayUrl}
              onChange={(e) => setGatewayUrl(e.target.value)}
              placeholder="wss://gateway.fluxer.app"
            />
          </label>
          <label className="login-field">
            <span className="login-label">CDN base</span>
            <input
              className="login-input"
              value={cdnBase}
              onChange={(e) => setCdnBase(e.target.value)}
              placeholder="https://cdn.fluxer.app"
            />
          </label>
        </details>

        {session.loginError && (
          <div className="login-error">✗ {session.loginError}</div>
        )}

        <button
          className="login-submit"
          type="submit"
          disabled={
            session.loggingIn ||
            (tab === "token"
              ? !token.trim()
              : !email.trim() || !password)
          }
        >
          {session.loggingIn ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
});