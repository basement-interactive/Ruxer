// MfaSetupModal — real in-app MFA (TOTP) management, replacing the old
// "managed on fluxer.app" dead-end. Three modes:
//   - enable:  generate a base32 secret client-side, show it for the user's
//              authenticator, verify a current code, then reveal backup codes.
//   - disable: verify a current code (or backup code) to turn TOTP off.
//   - backup:  regenerate backup codes (requires an active TOTP).
//
// The secret is generated with the Web Crypto CSPRNG (utils/totp). We never
// derive/verify codes locally — the server is the source of truth.

import { useEffect, useMemo, useState } from "react";
import { session } from "../stores";
import { api } from "../api";
import { generateTotpSecret, otpauthUri, formatSecretForDisplay } from "../utils/totp";
import { Modal } from "./Modal";
import { Button } from "./Button";
import "./MfaSetupModal.css";

export type MfaMode = "enable" | "disable" | "backup";

export function MfaSetupModal({
  open,
  mode,
  onClose,
  onChanged,
}: {
  open: boolean;
  mode: MfaMode;
  onClose: () => void;
  onChanged: () => void;
}) {
  const me = session.me;
  const account = me?.email ?? me?.username ?? "account";

  // A fresh secret per enable session. useMemo keyed on open+mode so re-opening
  // the enable flow rolls a new secret (never reuse a shown-then-abandoned one).
  const secret = useMemo(
    () => (mode === "enable" ? generateTotpSecret() : ""),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, mode],
  );

  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);

  // Reset transient state whenever the modal (re)opens.
  useEffect(() => {
    if (open) {
      setCode("");
      setPassword("");
      setError(null);
      setBackupCodes(null);
      setBusy(false);
    }
  }, [open, mode]);

  if (!open) return null;

  const uri = secret ? otpauthUri(secret, account) : "";

  const run = async (fn: () => Promise<{ backup_codes?: string[] } | unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const res = (await fn()) as { backup_codes?: string[] } | undefined;
      if (res && Array.isArray(res.backup_codes)) {
        setBackupCodes(res.backup_codes);
      } else {
        onChanged();
        onClose();
      }
      onChanged();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const title =
    mode === "enable"
      ? "Enable Two-Factor Auth"
      : mode === "disable"
        ? "Disable Two-Factor Auth"
        : "Backup Codes";

  // --- Backup-codes result screen (shared by enable + regenerate) ---
  if (backupCodes) {
    return (
      <Modal
        open={open}
        onClose={onClose}
        title="Save your backup codes"
        size="small"
        closeOnBackdrop={false}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => navigator.clipboard?.writeText(backupCodes.join("\n")).catch(() => {})}
            >
              Copy
            </Button>
            <Button variant="primary" onClick={onClose}>
              Done
            </Button>
          </>
        }
      >
        <p className="mfa-help">
          Each code works once. Store them somewhere safe — they're the only way in if you lose your
          authenticator.
        </p>
        <div className="mfa-backup-grid">
          {backupCodes.map((c) => (
            <code key={c} className="mfa-backup-code">
              {c}
            </code>
          ))}
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="small"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          {mode === "enable" && (
            <Button
              variant="primary"
              disabled={busy || code.trim().length < 6}
              onClick={() => run(() => api.enableTotp(secret, code.trim(), password || undefined))}
            >
              {busy ? "Verifying…" : "Enable"}
            </Button>
          )}
          {mode === "disable" && (
            <Button
              variant="danger"
              disabled={busy || code.trim().length < 6}
              onClick={() => run(() => api.disableTotp(code.trim(), password || undefined))}
            >
              {busy ? "Disabling…" : "Disable 2FA"}
            </Button>
          )}
          {mode === "backup" && (
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => run(() => api.regenerateBackupCodes(true, password || undefined))}
            >
              {busy ? "Generating…" : "Regenerate Codes"}
            </Button>
          )}
        </>
      }
    >
      {mode === "enable" && (
        <>
          <p className="mfa-help">
            Scan the setup key in your authenticator app (Google Authenticator, Aegis, 1Password…),
            or add it manually, then enter the 6-digit code it shows.
          </p>
          <div className="mfa-secret-block">
            <span className="mfa-field-label">Setup key</span>
            <code className="mfa-secret">{formatSecretForDisplay(secret)}</code>
            <button
              className="mfa-copy-btn"
              onClick={() => navigator.clipboard?.writeText(secret).catch(() => {})}
            >
              Copy key
            </button>
          </div>
          <details className="mfa-uri-details">
            <summary>Show setup link (otpauth://)</summary>
            <code className="mfa-uri">{uri}</code>
          </details>
        </>
      )}

      {mode === "disable" && (
        <p className="mfa-help">
          Enter a current code from your authenticator (or a backup code) to turn off two-factor
          authentication.
        </p>
      )}

      {mode === "backup" && (
        <p className="mfa-help">
          Generating new backup codes invalidates your old ones. You'll see the new set once.
        </p>
      )}

      {mode !== "backup" && (
        <label className="mfa-field">
          <span className="mfa-field-label">Authentication code</span>
          <input
            className="mfa-input"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            maxLength={8}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\s/g, ""))}
          />
        </label>
      )}

      <label className="mfa-field">
        <span className="mfa-field-label">Password {mode === "backup" ? "" : "(if prompted)"}</span>
        <input
          className="mfa-input"
          type="password"
          autoComplete="current-password"
          placeholder="Your account password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>

      {error && <div className="mfa-error">{error}</div>}
    </Modal>
  );
}
