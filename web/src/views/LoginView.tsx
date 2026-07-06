// Login view — re-authored to match the Fluxer client's login look & feel
// (centered "Welcome back" auth card, email/password, forgot-password link,
// register footer), branded Ruxer, and wired to the Tauri backend
// (session.loginWithCredentials → optional MFA → session.login). A token-login
// affordance + advanced instance/endpoint overrides remain for power users.
//
// Clean re-implementation (own markup + styles using the ported design tokens),
// not a copy of the AGPL reference source.

import { observer } from "mobx-react-lite";
import { useId, useState } from "react";
import { session } from "../stores";
import "./LoginView.css";

const DEFAULT_INSTANCE = "fluxer.app";

function AuthField({
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  autoComplete,
  autoFocus,
  inputMode,
  maxLength,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  autoFocus?: boolean;
  inputMode?: "numeric";
  maxLength?: number;
}) {
  const id = useId();
  return (
    <div className="auth-field">
      <label className="auth-field-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="auth-input"
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        inputMode={inputMode}
        maxLength={maxLength}
      />
    </div>
  );
}

export const LoginView = observer(function LoginView() {
  const [mode, setMode] = useState<"password" | "token">("password");
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const [instance, setInstance] = useState(DEFAULT_INSTANCE);
  const [apiBase, setApiBase] = useState("");
  const [gatewayUrl, setGatewayUrl] = useState("");
  const [cdnBase, setCdnBase] = useState("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [token, setToken] = useState("");
  const [kind, setKind] = useState<"session" | "bot" | "bearer">("session");

  const [mfa, setMfa] = useState<{ ticket: string; totp: boolean; webauthn: boolean } | null>(null);
  const [totpCode, setTotpCode] = useState("");

  const sharedOpts = {
    instance: instance.trim() || undefined,
    apiBase: apiBase.trim() || undefined,
    gatewayUrl: gatewayUrl.trim() || undefined,
    cdnBase: cdnBase.trim() || undefined,
  };

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await session.loginWithCredentials(email.trim(), password, sharedOpts);
      if (res.kind === "mfa") {
        setMfa({ ticket: res.ticket, totp: res.totp, webauthn: res.webauthn });
        setTotpCode("");
      }
    } catch {
      /* error surfaced via session.loginError */
    }
  };

  const submitToken = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await session.login(token.trim(), kind, sharedOpts);
    } catch {
      /* error surfaced via session.loginError */
    }
  };

  const submitTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfa) return;
    try {
      await session.completeMfa(mfa.ticket, totpCode.trim(), sharedOpts);
    } catch {
      /* error surfaced via session.loginError */
    }
  };

  const host = (instance.trim() || DEFAULT_INSTANCE).replace(/^https?:\/\//, "");
  const forgotUrl = `https://${host}/forgot`;
  const registerUrl = `https://${host}/register`;

  const advanced = (
    <details
      className="auth-advanced"
      open={advancedOpen}
      onToggle={(e) => setAdvancedOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary>Advanced</summary>
      <AuthField label="Instance" value={instance} onChange={setInstance} placeholder="fluxer.app" />
      <AuthField label="API base" value={apiBase} onChange={setApiBase} placeholder="https://api.fluxer.app/v1" />
      <AuthField label="Gateway URL" value={gatewayUrl} onChange={setGatewayUrl} placeholder="wss://gateway.fluxer.app" />
      <AuthField label="CDN base" value={cdnBase} onChange={setCdnBase} placeholder="https://cdn.fluxer.app" />
    </details>
  );

  // --- MFA challenge ---
  if (mfa) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-logo">Ruxer</div>
          <h1 className="auth-title">Two-factor authentication</h1>
          <p className="auth-subtitle">Enter the 6-digit code from your authenticator app.</p>
          <form className="auth-form" onSubmit={submitTotp}>
            <AuthField
              label="Authenticator code"
              value={totpCode}
              onChange={(v) => setTotpCode(v.replace(/\s/g, ""))}
              placeholder="000000"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={8}
              autoFocus
            />
            {session.loginError && <div className="auth-notice">{session.loginError}</div>}
            <button className="auth-primary" type="submit" disabled={session.loggingIn || totpCode.trim().length < 6}>
              {session.loggingIn ? "Verifying…" : "Verify"}
            </button>
          </form>
          <button
            className="auth-textlink auth-center"
            type="button"
            onClick={() => {
              setMfa(null);
              setTotpCode("");
              session.setLoginError(null);
            }}
          >
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  // --- Main login ---
  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">Ruxer</div>
        <h1 className="auth-title">Welcome back</h1>
        <p className="auth-subtitle">We're so excited to see you again!</p>

        {session.loginError && <div className="auth-notice">{session.loginError}</div>}

        {mode === "password" ? (
          <form className="auth-form" onSubmit={submitPassword}>
            <AuthField
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="you@example.com"
              autoComplete="username"
              autoFocus
            />
            <AuthField
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              placeholder="••••••••"
              autoComplete="current-password"
            />
            <a className="auth-textlink" href={forgotUrl} target="_blank" rel="noreferrer">
              Forgot your password?
            </a>
            <button
              className="auth-primary"
              type="submit"
              disabled={session.loggingIn || !email.trim() || !password}
            >
              {session.loggingIn ? "Signing in…" : "Log In"}
            </button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={submitToken}>
            <AuthField
              label="Token"
              type="password"
              value={token}
              onChange={setToken}
              placeholder="session / bot / bearer token"
              autoFocus
            />
            <div className="auth-field">
              <span className="auth-field-label">Token type</span>
              <div className="auth-radios">
                {(["session", "bot", "bearer"] as const).map((k) => (
                  <label key={k} className="auth-radio">
                    <input type="radio" name="kind" checked={kind === k} onChange={() => setKind(k)} />
                    <span>{k}</span>
                  </label>
                ))}
              </div>
            </div>
            <button className="auth-primary" type="submit" disabled={session.loggingIn || !token.trim()}>
              {session.loggingIn ? "Signing in…" : "Log In"}
            </button>
          </form>
        )}

        {advanced}

        <div className="auth-divider">
          <span>or</span>
        </div>

        <button
          className="auth-secondary"
          type="button"
          onClick={() => {
            setMode(mode === "password" ? "token" : "password");
            session.setLoginError(null);
          }}
        >
          {mode === "password" ? "Log in with a token" : "Log in with email & password"}
        </button>

        <div className="auth-footer">
          Need an account?{" "}
          <a className="auth-textlink" href={registerUrl} target="_blank" rel="noreferrer">
            Register
          </a>
        </div>
      </div>
    </div>
  );
});
