// SPDX-License-Identifier: AGPL-3.0-or-later

import {getRegionDisplayName as resolveRegionName} from '@fluxer/geo_utils/src/RegionFormatting';
import type {I18n} from '@lingui/core';
import {msg} from '@lingui/core/macro';

const YOUR_REGION_DESCRIPTOR = msg({
	message: 'your region',
	comment: 'Short label in the region display names. Keep it concise.',
});

export function getRegionDisplayName(i18n: I18n, countryCode?: string, regionCode?: string): string {
	if (!countryCode) {
		return i18n._(YOUR_REGION_DESCRIPTOR);
	}
	try {
		const countryName = resolveRegionName(countryCode, {locale: 'en'});
		if (countryCode === 'US' && regionCode) {
			try {
				const stateName = getUSStateName(regionCode);
				return `${stateName}, ${countryName || 'United States'}`;
			} catch {
				return countryName || countryCode;
			}
		}
		return countryName || countryCode;
	} catch {
		return countryCode;
	}
}

const getUSStateName = (stateCode: string): string => {
	const states: Record<string, string> = {
		AL: 'Alabama',
		AK: 'Alaska',
		AZ: 'Arizona',
		AR: 'Arkansas',
		CA: 'California',
		CO: 'Colorado',
		CT: 'Connecticut',
		DE: 'Delaware',
		FL: 'Florida',
		GA: 'Georgia',
		HI: 'Hawaii',
		ID: 'Idaho',
		IL: 'Illinois',
		IN: 'Indiana',
		IA: 'Iowa',
		KS: 'Kansas',
		KY: 'Kentucky',
		LA: 'Louisiana',
		ME: 'Maine',
		MD: 'Maryland',
		MA: 'Massachusetts',
		MI: 'Michigan',
		MN: 'Minnesota',
		MS: 'Mississippi',
		MO: 'Missouri',
		MT: 'Montana',
		NE: 'Nebraska',
		NV: 'Nevada',
		NH: 'New Hampshire',
		NJ: 'New Jersey',
		NM: 'New Mexico',
		NY: 'New York',
		NC: 'North Carolina',
		ND: 'North Dakota',
		OH: 'Ohio',
		OK: 'Oklahoma',
		OR: 'Oregon',
		PA: 'Pennsylvania',
		RI: 'Rhode Island',
		SC: 'South Carolina',
		SD: 'South Dakota',
		TN: 'Tennessee',
		TX: 'Texas',
		UT: 'Utah',
		VT: 'Vermont',
		VA: 'Virginia',
		WA: 'Washington',
		WV: 'West Virginia',
		WI: 'Wisconsin',
		WY: 'Wyoming',
		DC: 'District of Columbia',
	};
	return states[stateCode] || stateCode;
};
