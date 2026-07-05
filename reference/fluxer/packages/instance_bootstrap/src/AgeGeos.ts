// SPDX-License-Identifier: AGPL-3.0-or-later

import type {GeoEntry} from './Types';

export const AGE_RESTRICTED_GEOS: ReadonlyArray<GeoEntry> = [
	{countryCode: 'GB', regionCode: null},
	{countryCode: 'BR', regionCode: null},
];
export const AGE_BLOCKED_GEOS: ReadonlyArray<GeoEntry> = [{countryCode: 'US', regionCode: 'MS'}];
