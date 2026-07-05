// SPDX-License-Identifier: AGPL-3.0-or-later

import {msg} from '@lingui/core/macro';

export const GIFT_NOT_FOUND_TITLE_DESCRIPTOR = msg({
	message: 'Gift not found',
	comment: 'Title for gift claim or redemption errors when the gift code does not exist or cannot be found.',
});
export const GIFT_ALREADY_REDEEMED_TITLE_DESCRIPTOR = msg({
	message: 'Gift already redeemed',
	comment: 'Title for gift claim or redemption errors when the gift code was already claimed.',
});
export const FAILED_TO_REDEEM_GIFT_DESCRIPTOR = msg({
	message: "Couldn't redeem gift",
	comment: 'Generic gift redemption failure title or toast.',
});
