// SPDX-License-Identifier: AGPL-3.0-or-later

import type {PaginationItem} from '@app/features/channel/components/guild_members_page/GuildMembersPageShared';

export function buildPaginationRange(
	currentPage: number,
	totalPages: number,
	maxVisible: number,
): Array<PaginationItem> {
	if (totalPages <= 0) {
		return [];
	}
	const effectiveMax = Math.max(3, maxVisible);
	if (totalPages <= effectiveMax) {
		return Array.from({length: totalPages}, (_, index) => index + 1);
	}
	const innerSlots = Math.max(1, effectiveMax - 2);
	let start = currentPage - Math.floor(innerSlots / 2);
	let end = currentPage + Math.ceil(innerSlots / 2) - 1;
	start = Math.max(2, start);
	end = Math.min(totalPages - 1, end);
	while (end - start + 1 < innerSlots) {
		if (start > 2) {
			start -= 1;
		} else if (end < totalPages - 1) {
			end += 1;
		} else {
			break;
		}
	}
	const range: Array<PaginationItem> = [1];
	if (start > 2) {
		range.push('ellipsis-left');
	}
	for (let page = start; page <= end; page += 1) {
		range.push(page);
	}
	if (end < totalPages - 1) {
		range.push('ellipsis-right');
	}
	range.push(totalPages);
	return range;
}
