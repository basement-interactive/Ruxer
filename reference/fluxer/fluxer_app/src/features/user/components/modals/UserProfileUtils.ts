// SPDX-License-Identifier: AGPL-3.0-or-later

import {getBestContrastColor} from '@app/features/theme/utils/ColorUtils';

const DEFAULT_NOTCH_COLOR = 'rgba(255, 255, 255, 0.6)';
const DARK_NOTCH_COLOR = 'rgba(0, 0, 0, 0.4)';
const LIGHT_NOTCH_COLOR = 'rgba(255, 255, 255, 0.7)';
export const getContrastingNotchColor = (bannerColor?: number | null, hasBanner?: boolean): string => {
	if (!hasBanner || bannerColor == null) {
		return DEFAULT_NOTCH_COLOR;
	}
	return getBestContrastColor(bannerColor) === 'black' ? DARK_NOTCH_COLOR : LIGHT_NOTCH_COLOR;
};
