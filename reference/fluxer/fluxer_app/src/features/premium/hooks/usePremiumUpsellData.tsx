// SPDX-License-Identifier: AGPL-3.0-or-later

import type {AvailabilityCheck} from '@app/features/expressions/utils/ExpressionPermissionUtils';
import {
	type ExpressionPremiumSummary,
	getExpressionPremiumSummary,
	getPreviewItems,
} from '@app/features/expressions/utils/ExpressionPremiumSummary';
import type React from 'react';
import {useMemo} from 'react';

export interface UsePremiumUpsellDataResult<T> {
	accessibleItems: Array<T>;
	summary: ExpressionPremiumSummary<T>;
	previewContent?: React.ReactNode;
}

interface UsePremiumUpsellDataOptions<T> {
	items: ReadonlyArray<T>;
	getAvailability: (item: T) => AvailabilityCheck;
	getGuildId: (item: T) => string | undefined | null;
	renderPreviewItem?: (item: T) => React.ReactNode;
	previewSeed?: number;
	previewLimit?: number;
}

export const usePremiumUpsellData = <T,>({
	items,
	getAvailability,
	getGuildId,
	renderPreviewItem,
	previewSeed,
	previewLimit = 4,
}: UsePremiumUpsellDataOptions<T>): UsePremiumUpsellDataResult<T> => {
	const summary = useMemo(
		() => getExpressionPremiumSummary(items, getAvailability, getGuildId),
		[items, getAvailability, getGuildId],
	);
	const seed = useMemo(() => previewSeed ?? Date.now(), [previewSeed, summary.lockedItems.length]);
	const previewContent = useMemo(() => {
		if (!renderPreviewItem || summary.lockedItems.length === 0) {
			return undefined;
		}
		const previewItems = getPreviewItems(summary.lockedItems, previewLimit, seed);
		if (previewItems.length === 0) {
			return undefined;
		}
		return <>{previewItems.map((item) => renderPreviewItem(item))}</>;
	}, [renderPreviewItem, summary.lockedItems, previewLimit, seed]);
	return {
		accessibleItems: summary.accessibleItems,
		summary,
		previewContent,
	};
};
