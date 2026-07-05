// SPDX-License-Identifier: AGPL-3.0-or-later

import type {FlatEmoji} from '@app/features/emoji/types/EmojiTypes';
import type React from 'react';

export interface ExpressionPickerItem {
	id: string;
	type: 'emoji' | 'sticker' | 'gif' | 'meme';
	content: FlatEmoji | unknown;
	renderComponent: () => React.ReactNode;
	ariaLabel?: string;
}

export interface ExpressionPickerSection {
	id: string;
	title: string;
	items: ReadonlyArray<ExpressionPickerItem>;
}

export function buildExpressionItem(
	id: string,
	type: ExpressionPickerItem['type'],
	content: FlatEmoji | unknown,
	renderComponent: () => React.ReactNode,
	ariaLabel?: string,
): ExpressionPickerItem {
	return {
		id,
		type,
		content,
		renderComponent,
		ariaLabel,
	};
}

export function buildExpressionSection(
	id: string,
	title: string,
	items: ReadonlyArray<ExpressionPickerItem>,
): ExpressionPickerSection {
	return {
		id,
		title,
		items,
	};
}

export function getExpressionPickerSelectedId(item: ExpressionPickerItem | null): string | null {
	if (!item) return null;
	return item.id;
}

export function getExpressionPickerHeight(itemCount: number, itemHeight: number, sectionHeaderHeight: number): number {
	const estimatedHeight = itemCount * itemHeight;
	const totalSections = Math.ceil(itemCount / 20);
	const totalSectionHeaders = totalSections * sectionHeaderHeight;
	return estimatedHeight + totalSectionHeaders;
}
