// SPDX-License-Identifier: AGPL-3.0-or-later

import {int2hex} from '@app/features/theme/utils/ColorUtils';
import type {User} from '@app/features/user/models/User';
import {getDefaultAvatarPrimaryColor} from '@app/features/user/utils/AvatarUtils';

const toHex = (value: number | null | undefined): string | null => {
	if (value == null) return null;
	return int2hex(value);
};
export const getPlaceholderAvatarColor = (user: User | null | undefined, fallback: string): string => {
	if (!user) return fallback;
	if (typeof user.avatarColor === 'number') return int2hex(user.avatarColor);
	if (!user.avatar) {
		return int2hex(getDefaultAvatarPrimaryColor(user.id));
	}
	const accentColor = toHex(user.accentColor);
	if (accentColor) return accentColor;
	return fallback;
};
