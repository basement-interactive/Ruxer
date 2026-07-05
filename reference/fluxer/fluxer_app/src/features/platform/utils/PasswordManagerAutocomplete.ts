// SPDX-License-Identifier: AGPL-3.0-or-later

import type React from 'react';

const CREDENTIAL_INPUT_TYPES = new Set(['email', 'password']);

export interface PasswordManagerIgnoreAttributes {
	autoComplete?: string;
	'data-1p-ignore'?: string;
	'data-op-ignore'?: string;
	'data-lpignore'?: string;
	'data-bwignore'?: string;
	'data-form-type'?: string;
	'data-protonpass-ignore'?: string;
}

export type InputWithPasswordManagerIgnoreAttributes = React.InputHTMLAttributes<HTMLInputElement> &
	PasswordManagerIgnoreAttributes;
export type TextareaWithPasswordManagerIgnoreAttributes = React.TextareaHTMLAttributes<HTMLTextAreaElement> &
	PasswordManagerIgnoreAttributes;

export const PASSWORD_MANAGER_IGNORE_ATTRIBUTES: PasswordManagerIgnoreAttributes = {
	autoComplete: 'off',
	'data-1p-ignore': 'true',
	'data-op-ignore': 'true',
	'data-lpignore': 'true',
	'data-bwignore': 'true',
	'data-form-type': 'other',
	'data-protonpass-ignore': 'true',
};

export function shouldApplyPasswordManagerIgnoreAttributes(
	type: React.HTMLInputTypeAttribute | undefined,
	autoComplete?: string,
): boolean {
	const normalizedType = (type ?? 'text').toLowerCase();
	if (CREDENTIAL_INPUT_TYPES.has(normalizedType)) return false;
	const normalizedAutoComplete = autoComplete?.trim().toLowerCase();
	if (normalizedAutoComplete && normalizedAutoComplete !== 'off') return false;
	return true;
}
