// SPDX-License-Identifier: AGPL-3.0-or-later

import {DAY_MS} from '@app/features/channel/components/guild_members_page/GuildMembersPageShared';
import {formatTimestamp} from '@app/features/messaging/utils/markdown/DateFormatter';
import {TimestampStyle} from '@app/features/messaging/utils/markdown/parser/Enums';
import type {I18n} from '@lingui/core';
import {plural} from '@lingui/core/macro';

export function formatRecentOrFallback(date: Date, i18n: I18n): string {
	const diffMs = Date.now() - date.getTime();
	if (diffMs < DAY_MS) {
		const minutes = Math.max(1, Math.floor(Math.max(0, diffMs) / 60_000));
		if (minutes < 60) {
			return plural(minutes, {one: '# minute ago', other: '# minutes ago'});
		}
		const hours = Math.floor(minutes / 60);
		return plural(hours, {one: '# hour ago', other: '# hours ago'});
	}
	return formatTimestamp(Math.floor(date.getTime() / 1000), TimestampStyle.RelativeTime, i18n);
}
