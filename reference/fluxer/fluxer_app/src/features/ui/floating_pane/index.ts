// SPDX-License-Identifier: AGPL-3.0-or-later

export type {
	Corner,
	DragBounds,
	FlingOptions,
	FloatingPaneGeometry,
	Point,
	ResizeEdge,
	ResizeResult,
	ResizeStart,
	Size,
	WidthRange,
} from './FloatingPaneMath';
export {
	ALL_CORNERS,
	ALL_RESIZE_EDGES,
	clampPoint,
	clampWidth,
	computeResize,
	DEFAULT_FLING_OPTIONS,
	getCornerPoint,
	getDragBounds,
	getEffectiveWidthRange,
	getPaneHeight,
	pickCornerForFling,
	reconcileToGeometry,
	snapPointToCorner,
} from './FloatingPaneMath';
export type {FloatingPaneResizeHandlesProps} from './FloatingPaneResizeHandles';
export {FloatingPaneResizeHandles} from './FloatingPaneResizeHandles';
export type {FloatingPanePointerHandlers, FloatingPaneResult, UseFloatingPaneOptions} from './useFloatingPane';
export {useFloatingPane} from './useFloatingPane';
