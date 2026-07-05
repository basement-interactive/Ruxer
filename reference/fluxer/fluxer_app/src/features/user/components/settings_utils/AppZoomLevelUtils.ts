// SPDX-License-Identifier: AGPL-3.0-or-later

import {Platform} from '@app/features/platform/types/Platform';

export function shouldShowAppZoomLevel(): boolean {
	return Platform.isElectron;
}
