// SPDX-License-Identifier: AGPL-3.0-or-later

import type {ValueOf} from '@fluxer/constants/src/ValueOf';

export const VerificationErrorType = {
	LINK_EXPIRED: 'LINK_EXPIRED',
	SERVER_ERROR: 'SERVER_ERROR',
	INVALID_TOKEN: 'INVALID_TOKEN',
} as const;

export type VerificationErrorType = ValueOf<typeof VerificationErrorType>;

export interface VerificationError {
	type: VerificationErrorType;
	message?: string;
}

export const createVerificationError = (type: VerificationErrorType, message?: string): VerificationError => ({
	type,
	message,
});
