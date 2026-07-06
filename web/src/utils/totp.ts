// TOTP enrollment helpers — client-side secret generation for MFA setup.
//
// The Fluxer API's POST /users/@me/mfa/totp/enable expects the CLIENT to
// generate the shared secret (base32), present it to the user (QR / manual),
// and submit it back with a current code. We never derive codes locally — the
// server verifies. Secret entropy comes from the Web Crypto CSPRNG.

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; // RFC 4648, no padding

/// Encode bytes as RFC 4648 base32 (uppercase, unpadded) — the format
/// authenticator apps expect for a TOTP secret.
function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return out;
}

/// Generate a fresh 160-bit TOTP secret (32 base32 chars) from the CSPRNG.
export function generateTotpSecret(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return base32Encode(bytes);
}

/// Format a secret in 4-char groups for readable manual entry.
export function formatSecretForDisplay(secret: string): string {
  return secret.replace(/(.{4})/g, "$1 ").trim();
}

/// Build the otpauth:// URI an authenticator app imports (via QR or paste).
/// SHA1 / 6 digits / 30s are the TOTP defaults every app assumes.
export function otpauthUri(secret: string, account: string, issuer = "Ruxer"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: "6",
    period: "30",
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
