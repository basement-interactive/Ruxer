// SPDX-License-Identifier: AGPL-3.0-or-later

import {useMasonryGridNavigation} from '@app/features/app/hooks/useMasonryGridNavigation';
import {MasonryListComputer} from '@app/features/channel/components/MasonryListComputer';
import {MASONRY_OVERSCAN_PX, MASONRY_PADDING_PX} from '@app/features/channel/components/pickers/shared/PickerConstants';
import type * as React from 'react';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';

type VisibleItemTuple = [itemKey: string, sectionIndex: number, itemIndex: number];

interface Coords {
	position: 'absolute' | 'sticky';
	left?: number;
	right?: number;
	top?: number;
	width: number;
	height: number;
}

type CoordsMap = Record<string, Coords>;
type VisibleSections = Record<string, Array<VisibleItemTuple>>;

interface GridCoordinates {
	section: number;
	row: number;
	column: number;
}

interface GridData {
	boundaries: Array<number>;
	coordinates: Record<string, GridCoordinates>;
}

export interface MasonryExtraSection {
	sectionIndex: number;
	height: number;
	render: () => React.ReactNode;
}

const EMPTY_EXTRA_SECTIONS: ReadonlyArray<MasonryExtraSection> = [];

export function MasonryVirtualGrid<T>({
	data,
	itemKeys,
	columns,
	itemGutter,
	viewportWidth,
	viewportHeight,
	scrollTop,
	getItemKey,
	getItemHeight,
	onSelectItemKey,
	checkSuspension,
	renderItem,
	onContentSizeChange,
	extraSections,
	overscanPx = MASONRY_OVERSCAN_PX,
	paddingPx = MASONRY_PADDING_PX,
	bottomPaddingPx = MASONRY_PADDING_PX * 2,
}: {
	data: ReadonlyArray<T>;
	itemKeys: ReadonlyArray<string>;
	columns: number;
	itemGutter: number;
	viewportWidth: number;
	viewportHeight: number;
	scrollTop: number;
	getItemKey: (item: T, index: number) => string;
	getItemHeight: (item: T, index: number, columnWidth: number) => number;
	onSelectItemKey: (itemKey: string) => void;
	checkSuspension: () => boolean;
	renderItem: (args: {item: T; itemKey: string; coords: Coords; isFocused: boolean; index: number}) => React.ReactNode;
	onContentSizeChange?: (contentSize: number) => void;
	extraSections?: ReadonlyArray<MasonryExtraSection>;
	overscanPx?: number;
	paddingPx?: number;
	bottomPaddingPx?: number;
}) {
	const stableExtraSections = extraSections ?? EMPTY_EXTRA_SECTIONS;
	const [masonryComputer] = useState(() => new MasonryListComputer());
	const containerRef = useRef<HTMLDivElement>(null);
	const [version, setVersion] = useState(0);
	useEffect(() => {
		setVersion((v) => v + 1);
	}, [data, columns, itemGutter, viewportWidth, viewportHeight, itemKeys, stableExtraSections]);
	const sectionCount = 1 + stableExtraSections.length;
	const getItemKeyForComputer = useCallback(
		(sectionIndex: number, itemIndex: number): string | null => {
			if (sectionIndex !== 0) return null;
			const item = data[itemIndex];
			return item != null ? getItemKey(item, itemIndex) : null;
		},
		[data, getItemKey],
	);
	const getItemHeightForComputer = useCallback(
		(sectionIndex: number, itemIndex: number, columnWidth: number): number => {
			if (sectionIndex !== 0) return 0;
			const item = data[itemIndex];
			if (item == null) return 0;
			return getItemHeight(item, itemIndex, columnWidth);
		},
		[data, getItemHeight],
	);
	const getSectionHeightForComputer = useCallback(
		(sectionIndex: number): number => {
			if (sectionIndex === 0) return 0;
			const extra = stableExtraSections.find((s) => s.sectionIndex === sectionIndex);
			return extra?.height ?? 0;
		},
		[stableExtraSections],
	);
	const masonryState = useMemo(() => {
		if (viewportWidth <= 0 || viewportHeight <= 0) {
			return {
				coordsMap: {} as CoordsMap,
				visibleSections: {} as VisibleSections,
				totalHeight: 0,
				gridData: null,
			};
		}
		masonryComputer.mergeProps({
			sections: [data.length, ...Array.from({length: sectionCount - 1}, () => 0)],
			columns,
			itemGutter,
			getItemKey: getItemKeyForComputer,
			getItemHeight: getItemHeightForComputer,
			getSectionHeight: getSectionHeightForComputer,
			bufferWidth: viewportWidth,
			padding: {left: paddingPx, right: paddingPx, top: 0, bottom: 0},
			version,
		});
		const start = Math.max(0, scrollTop - overscanPx);
		const end = scrollTop + viewportHeight + overscanPx;
		masonryComputer.computeVisibleSections(start, end);
		const state = masonryComputer.getState() as {
			coordsMap: CoordsMap;
			visibleSections: VisibleSections;
			totalHeight: number;
			gridData: GridData;
		};
		return state;
	}, [
		masonryComputer,
		data.length,
		sectionCount,
		columns,
		itemGutter,
		getItemKeyForComputer,
		getItemHeightForComputer,
		getSectionHeightForComputer,
		viewportWidth,
		viewportHeight,
		scrollTop,
		overscanPx,
		paddingPx,
		version,
	]);
	const {focusedItemKey} = useMasonryGridNavigation({
		gridData: masonryState.gridData,
		itemKeys,
		columns,
		onSelect: onSelectItemKey,
		containerRef: containerRef as React.RefObject<HTMLElement>,
		checkSuspension,
	});
	const topPadding = paddingPx;
	const contentSize = masonryState.totalHeight + topPadding + bottomPaddingPx;
	useEffect(() => {
		onContentSizeChange?.(contentSize);
	}, [contentSize, onContentSizeChange]);
	const visibleEntries = Object.entries(masonryState.visibleSections) as Array<[string, VisibleSections[string]]>;
	const parseSectionIndex = (sectionKey: string): number | null => {
		const prefix = 'section-';
		if (!sectionKey.startsWith(prefix)) return null;
		const rest = sectionKey.slice(prefix.length);
		if (rest.includes('-')) return null;
		const n = Number(rest);
		return Number.isFinite(n) ? n : null;
	};
	return (
		<div
			ref={containerRef}
			style={{
				position: 'relative',
				width: '100%',
				height: contentSize,
				pointerEvents: 'none',
			}}
			data-flx="channel.pickers.masonry-virtual-grid.div"
		>
			{visibleEntries.flatMap(([sectionKey, items]): Array<React.ReactNode> => {
				const sectionCoords = masonryState.coordsMap[sectionKey];
				if (!sectionCoords) return [];
				const sectionTop = (sectionCoords.top ?? 0) + topPadding;
				const sectionIndex = parseSectionIndex(sectionKey);
				if (sectionIndex != null && sectionIndex > 0) {
					const extra = stableExtraSections.find((s) => s.sectionIndex === sectionIndex);
					if (!extra || extra.height <= 0) return [];
					return [
						<div
							key={sectionKey}
							style={{
								position: 'absolute',
								left: sectionCoords.left,
								right: sectionCoords.right,
								width: sectionCoords.width,
								top: sectionTop,
								height: sectionCoords.height,
								pointerEvents: 'none',
							}}
							data-flx="channel.pickers.masonry-virtual-grid.div--2"
						>
							{extra.render()}
						</div>,
					];
				}
				return items.flatMap(([itemKey, itemSectionIndex, itemIndex]): Array<React.ReactNode> => {
					if (itemSectionIndex !== 0) return [];
					const itemCoords = masonryState.coordsMap[itemKey];
					if (!itemCoords) return [];
					const item = data[itemIndex];
					if (item == null) return [];
					const absoluteItemCoords: Coords = {
						...itemCoords,
						top: (itemCoords.top ?? 0) + sectionTop,
					};
					const node = renderItem({
						item,
						itemKey,
						coords: absoluteItemCoords,
						isFocused: focusedItemKey === itemKey,
						index: itemIndex,
					});
					return node == null ? [] : [node];
				});
			})}
		</div>
	);
}
