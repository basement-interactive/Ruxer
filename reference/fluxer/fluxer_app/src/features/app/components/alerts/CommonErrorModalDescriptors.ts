// SPDX-License-Identifier: AGPL-3.0-or-later

import {msg} from '@lingui/core/macro';

export const GENERIC_ERROR_BODY_DESCRIPTOR = msg({
	message: 'Something went wrong. Please try again in a moment.',
	comment: 'Generic fallback body shown in an error modal when an action fails for an unexpected reason.',
});
export const RATE_LIMITED_ERROR_TITLE_DESCRIPTOR = msg({
	message: "You're going too fast",
	comment: 'Title of the error modal shown when an action is rate limited.',
});
export const RATE_LIMITED_ERROR_BODY_DESCRIPTOR = msg({
	message: 'Please wait a moment and try again.',
	comment: 'Body of the error modal shown when an action is rate limited.',
});
