// SPDX-License-Identifier: AGPL-3.0-or-later

export interface MemberListGroupSnapshot {
	id: string;
	count: number;
}

export interface MemberListGroupLayout {
	id: string;
	count: number;
	headerRowIndex: number;
	memberStartIndex: number;
	memberEndIndex: number;
	rowEndIndex: number;
}

type RowSeekDirection = 'backward' | 'forward';

export function buildMemberListLayout(groups: ReadonlyArray<MemberListGroupSnapshot>): Array<MemberListGroupLayout> {
	const layouts: Array<MemberListGroupLayout> = [];
	let rowIndex = 0;
	let memberIndex = 0;
	for (const group of groups) {
		const effectiveCount = Math.max(0, group.count);
		if (effectiveCount === 0) {
		} else {
			const headerRowIndex = rowIndex;
			const memberStartIndex = memberIndex;
			const memberEndIndex = memberIndex + effectiveCount - 1;
			const rowEndIndex = headerRowIndex + effectiveCount;
			layouts.push({
				id: group.id,
				count: effectiveCount,
				headerRowIndex,
				memberStartIndex,
				memberEndIndex,
				rowEndIndex,
			});
			rowIndex = rowEndIndex + 1;
			memberIndex = memberEndIndex + 1;
		}
	}
	return layouts;
}

export function getTotalRowsFromLayout(layouts: ReadonlyArray<MemberListGroupLayout>): number {
	if (layouts.length === 0) {
		return 0;
	}
	return layouts[layouts.length - 1]!.rowEndIndex + 1;
}

export interface MemberListRowHeights {
	memberHeight: number;
	headerHeight: number;
}

export function buildMemberListRowOffsets(
	layouts: ReadonlyArray<MemberListGroupLayout>,
	totalRows: number,
	{memberHeight, headerHeight}: MemberListRowHeights,
): Array<number> {
	const safeTotalRows = Math.max(0, Math.floor(totalRows));
	const offsets = new Array<number>(safeTotalRows + 1);
	offsets[0] = 0;
	if (safeTotalRows === 0) {
		return offsets;
	}
	const headerRows = new Set<number>();
	for (const layout of layouts) {
		headerRows.add(layout.headerRowIndex);
	}
	for (let rowIndex = 0; rowIndex < safeTotalRows; rowIndex += 1) {
		const rowHeight = headerRows.has(rowIndex) ? headerHeight : memberHeight;
		offsets[rowIndex + 1] = offsets[rowIndex]! + rowHeight;
	}
	return offsets;
}

export function findMemberListRowForOffset(offsets: ReadonlyArray<number>, pixel: number): number {
	const lastRow = offsets.length - 2;
	if (lastRow < 0) {
		return 0;
	}
	if (pixel <= 0) {
		return 0;
	}
	if (pixel >= offsets[lastRow + 1]!) {
		return lastRow;
	}
	let low = 0;
	let high = lastRow;
	while (low < high) {
		const mid = (low + high + 1) >> 1;
		if (offsets[mid]! <= pixel) {
			low = mid;
		} else {
			high = mid - 1;
		}
	}
	return low;
}

export function getTotalMemberCount(groups: ReadonlyArray<MemberListGroupSnapshot>): number {
	let count = 0;
	for (const group of groups) {
		count += Math.max(0, group.count);
	}
	return count;
}

export function getGroupLayoutForRow(
	layouts: ReadonlyArray<MemberListGroupLayout>,
	rowIndex: number,
): MemberListGroupLayout | null {
	for (const layout of layouts) {
		if (rowIndex < layout.headerRowIndex) {
			return null;
		}
		if (rowIndex <= layout.rowEndIndex) {
			return layout;
		}
	}
	return null;
}

export function getMemberIndexForRow(
	layouts: ReadonlyArray<MemberListGroupLayout>,
	rowIndex: number,
	direction: RowSeekDirection,
): number | null {
	const layout = getGroupLayoutForRow(layouts, rowIndex);
	if (!layout) {
		return null;
	}
	if (rowIndex === layout.headerRowIndex) {
		if (direction === 'forward') {
			return layout.count > 0 ? layout.memberStartIndex : null;
		}
		const previousIndex = layout.memberStartIndex - 1;
		return previousIndex >= 0 ? previousIndex : null;
	}
	return layout.memberStartIndex + (rowIndex - layout.headerRowIndex - 1);
}

export function getMemberIndexRangeForRowRange(
	layouts: ReadonlyArray<MemberListGroupLayout>,
	startRowIndex: number,
	endRowIndex: number,
): [number, number] | null {
	const start = getMemberIndexForRow(layouts, startRowIndex, 'forward');
	const end = getMemberIndexForRow(layouts, endRowIndex, 'backward');
	if (start == null || end == null || start > end) {
		return null;
	}
	return [start, end];
}

export function getRowIndexForMemberIndex(
	layouts: ReadonlyArray<MemberListGroupLayout>,
	memberIndex: number,
): number | null {
	if (memberIndex < 0) {
		return null;
	}
	if (layouts.length === 0) {
		return memberIndex;
	}
	for (const layout of layouts) {
		if (memberIndex < layout.memberStartIndex) {
			return null;
		}
		if (memberIndex <= layout.memberEndIndex) {
			return layout.headerRowIndex + 1 + (memberIndex - layout.memberStartIndex);
		}
	}
	return null;
}

export function getRowIndexRangeForMemberIndexRange(
	layouts: ReadonlyArray<MemberListGroupLayout>,
	startMemberIndex: number,
	endMemberIndex: number,
): [number, number] | null {
	const start = getRowIndexForMemberIndex(layouts, startMemberIndex);
	const end = getRowIndexForMemberIndex(layouts, endMemberIndex);
	if (start == null || end == null || start > end) {
		return null;
	}
	return [start, end];
}
