// SPDX-License-Identifier: AGPL-3.0-or-later

import {NotFound, Redirect, type To} from '@app/features/platform/components/router/RouterTypes';

export function redirect(
	to: To,
	options?: {
		replace?: boolean;
	},
): Redirect {
	return new Redirect(to, options);
}

export function notFound(message?: string): NotFound {
	return new NotFound(message);
}
