// SPDX-License-Identifier: AGPL-3.0-or-later

import type {ValidationErrorCode} from '@fluxer/constants/src/ValidationErrorCodes';

export interface ValidationError {
	path: string;
	message: string;
	code?: ValidationErrorCode;
}
