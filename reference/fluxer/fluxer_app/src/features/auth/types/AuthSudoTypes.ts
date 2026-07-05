// SPDX-License-Identifier: AGPL-3.0-or-later

export interface SudoVerificationPayload extends Record<string, unknown> {
	password?: string;
	mfa_method?: 'totp' | 'webauthn';
	mfa_code?: string;
	webauthn_response?: unknown;
	webauthn_challenge?: string;
}
