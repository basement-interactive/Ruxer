// SPDX-License-Identifier: AGPL-3.0-or-later

import {APIErrorCodes} from '@fluxer/constants/src/ApiErrorCodes';
import {ForbiddenError} from '@fluxer/errors/src/domains/core/ForbiddenError';

export class NsfwEmojiStickerBlockedError extends ForbiddenError {
	constructor() {
		super({
			code: APIErrorCodes.NSFW_EMOJI_STICKER_BLOCKED,
			message: 'This emoji or sticker is classified as NSFW and cannot be used in this context',
		});
	}
}
