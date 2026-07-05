// SPDX-License-Identifier: AGPL-3.0-or-later

import type {XYCoord} from 'react-dnd';

export function computeVerticalDropPosition(
	clientOffset: XYCoord,
	boundingRect: DOMRect,
	edgeThreshold: number = 0.5,
): 'before' | 'after' | 'center' {
	const height = boundingRect.bottom - boundingRect.top;
	const offsetY = clientOffset.y - boundingRect.top;
	if (edgeThreshold >= 0.5) {
		return offsetY < height / 2 ? 'before' : 'after';
	}
	const threshold = height * edgeThreshold;
	if (offsetY < threshold) return 'before';
	if (offsetY > height - threshold) return 'after';
	return 'center';
}

export function computeHorizontalDropPosition(clientOffset: XYCoord, boundingRect: DOMRect): 'before' | 'after' {
	const width = boundingRect.right - boundingRect.left;
	const offsetX = clientOffset.x - boundingRect.left;
	return offsetX < width / 2 ? 'before' : 'after';
}
