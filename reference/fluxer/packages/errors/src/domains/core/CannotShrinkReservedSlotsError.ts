// SPDX-License-Identifier: AGPL-3.0-or-later

import {APIErrorCodes} from '@fluxer/constants/src/ApiErrorCodes';
import {BadRequestError} from '@fluxer/errors/src/domains/core/BadRequestError';

export class CannotShrinkReservedSlotsError extends BadRequestError {
	constructor(reservedSlotIndices: Array<number>) {
		super({
			code: APIErrorCodes.CANNOT_SHRINK_RESERVED_SLOTS,
			messageVariables: {
				count: reservedSlotIndices.length,
				indices: reservedSlotIndices.join(', '),
			},
		});
	}
}
