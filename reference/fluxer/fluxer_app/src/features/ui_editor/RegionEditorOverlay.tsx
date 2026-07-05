// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Direct-manipulation region editor. When active, it draws an interactive
// outline over each known layout region (located live by its `data-flx`
// anchor's bounding box) so the user can:
//   * DRAG a region's body left/right to reorder it among its siblings
//   * DRAG a region's inner edge to resize its width
// Changes apply instantly through the LayoutEngine (order / widthPx tweaks),
// and are reported back so the panel can fold them into the saved Layout.
//
// This replaces the old ◀▶ / width-number controls with real dragging, which
// is what "move elements around and resize whenever I want" asks for. It
// targets the same stable region anchors the rest of the engine uses, so it
// never fights the app's own React tree — it only reads geometry and writes
// CSS order/width.

import {useCallback, useEffect, useRef, useState} from 'react';

import {KNOWN_REGIONS, type Layout, LayoutEngine, type RegionTweak} from './LayoutEngine';
import styles from './RegionEditorOverlay.module.css';

interface Box {
	anchor: string;
	label: string;
	rect: DOMRect;
}

interface RegionEditorOverlayProps {
	layout: Layout;
	onChange: (anchor: string, patch: Partial<RegionTweak>) => void;
	/** Toggle hide on an anchor (adds the anchor to the layout if new). */
	onToggleHide: (anchor: string) => void;
	onClose: () => void;
}

/** Turn a dotted data-flx anchor into a short human label (last 1-2 segments). */
function labelFor(anchor: string): string {
	const parts = anchor.split('.');
	const known = KNOWN_REGIONS.find((r) => r.anchor === anchor);
	if (known) return known.label;
	return parts.slice(-2).join(' › ');
}

/** Every editable anchor = the KNOWN defaults PLUS any the user has picked
 * (present in layout.regions). This is what makes the editor "way more
 * customizable" — you're not limited to the 3-4 defaults; hover-pick any
 * element in the app and it becomes movable/resizable/hideable. */
function measure(layout: Layout): Box[] {
	const anchors = new Set<string>(KNOWN_REGIONS.map((r) => r.anchor));
	for (const r of layout.regions) anchors.add(r.anchor);
	const boxes: Box[] = [];
	for (const anchor of anchors) {
		const el = document.querySelector(`[data-flx="${anchor.replace(/["\\]/g, '\\$&')}"]`);
		if (el) {
			const rect = el.getBoundingClientRect();
			if (rect.width > 0 && rect.height > 0) boxes.push({anchor, label: labelFor(anchor), rect});
		}
	}
	return boxes;
}

/** Find the nearest ancestor (including self) that carries a data-flx anchor,
 * for hover-pick. Skips the editor's own overlay elements. */
function pickAnchorAt(x: number, y: number): {anchor: string; rect: DOMRect} | null {
	const els = document.elementsFromPoint(x, y);
	for (const el of els) {
		if (!(el instanceof HTMLElement)) continue;
		if (el.closest('[data-flx^="ui-editor"]')) continue; // ignore the editor UI itself
		const withAnchor = el.closest('[data-flx]') as HTMLElement | null;
		if (withAnchor) {
			const anchor = withAnchor.getAttribute('data-flx');
			if (anchor && !anchor.startsWith('ui-editor')) {
				return {anchor, rect: withAnchor.getBoundingClientRect()};
			}
		}
	}
	return null;
}

export function RegionEditorOverlay({layout, onChange, onToggleHide, onClose}: RegionEditorOverlayProps): React.ReactElement {
	const [boxes, setBoxes] = useState<Box[]>([]);
	const [picking, setPicking] = useState(false);
	const [hover, setHover] = useState<{anchor: string; rect: DOMRect} | null>(null);
	const layoutRef = useRef(layout);
	layoutRef.current = layout;
	const dragState = useRef<
		| {kind: 'move'; anchor: string; startX: number; siblings: Box[]}
		| {kind: 'resize'; anchor: string; startX: number; startWidth: number}
		| null
	>(null);

	// Re-measure on mount, on resize, and periodically while open (regions move
	// as the user drags / the layout reflows). rAF-throttled. Reads the latest
	// layout via ref so newly-picked anchors appear without re-subscribing.
	useEffect(() => {
		let raf = 0;
		const tick = () => {
			setBoxes(measure(layoutRef.current));
			raf = requestAnimationFrame(() => {
				window.setTimeout(tick, 250);
			});
		};
		tick();
		window.addEventListener('resize', tick);
		return () => {
			cancelAnimationFrame(raf);
			window.removeEventListener('resize', tick);
		};
	}, []);

	// Pick mode: hover the app to highlight the nearest data-flx element; click
	// adds it to the editable set. Esc / toggling off exits pick mode.
	useEffect(() => {
		if (!picking) {
			setHover(null);
			return;
		}
		const onMove = (e: MouseEvent) => setHover(pickAnchorAt(e.clientX, e.clientY));
		const onClickPick = (e: MouseEvent) => {
			const hit = pickAnchorAt(e.clientX, e.clientY);
			if (hit) {
				e.preventDefault();
				e.stopPropagation();
				// Add it to the layout (no-op tweak just registers the anchor).
				onChange(hit.anchor, {});
				setBoxes(measure(layoutRef.current));
			}
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') setPicking(false);
		};
		window.addEventListener('mousemove', onMove, true);
		window.addEventListener('click', onClickPick, true);
		window.addEventListener('keydown', onKey, true);
		return () => {
			window.removeEventListener('mousemove', onMove, true);
			window.removeEventListener('click', onClickPick, true);
			window.removeEventListener('keydown', onKey, true);
		};
	}, [picking, onChange]);

	const onPointerMove = useCallback(
		(e: PointerEvent) => {
			const st = dragState.current;
			if (!st) return;
			if (st.kind === 'resize') {
				const next = Math.max(48, Math.round(st.startWidth + (e.clientX - st.startX)));
				LayoutEngine.previewRegionWidth(st.anchor, next);
			} else {
				// Reorder: if dragged past a sibling's midpoint, swap order.
				const dx = e.clientX - st.startX;
				const self = st.siblings.find((b) => b.anchor === st.anchor);
				if (!self) return;
				const centerNow = self.rect.left + self.rect.width / 2 + dx;
				let order = 0;
				for (const b of st.siblings) {
					if (b.anchor === st.anchor) continue;
					if (centerNow > b.rect.left + b.rect.width / 2) order += 1;
				}
				LayoutEngine.previewRegionOrder(st.anchor, order);
			}
		},
		[],
	);

	const endDrag = useCallback(
		(e: PointerEvent) => {
			const st = dragState.current;
			dragState.current = null;
			window.removeEventListener('pointermove', onPointerMove);
			window.removeEventListener('pointerup', endDrag);
			if (!st) return;
			// Commit the final value into the saved Layout.
			if (st.kind === 'resize') {
				const next = Math.max(48, Math.round(st.startWidth + (e.clientX - st.startX)));
				onChange(st.anchor, {widthPx: next});
			} else {
				const self = st.siblings.find((b) => b.anchor === st.anchor);
				if (self) {
					const centerNow = self.rect.left + self.rect.width / 2 + (e.clientX - st.startX);
					let order = 0;
					for (const b of st.siblings) {
						if (b.anchor === st.anchor) continue;
						if (centerNow > b.rect.left + b.rect.width / 2) order += 1;
					}
					onChange(st.anchor, {order});
				}
			}
			setBoxes(measure(layoutRef.current));
		},
		[onPointerMove, onChange],
	);

	const startMove = useCallback(
		(anchor: string, e: React.PointerEvent) => {
			e.preventDefault();
			dragState.current = {kind: 'move', anchor, startX: e.clientX, siblings: measure(layoutRef.current)};
			window.addEventListener('pointermove', onPointerMove);
			window.addEventListener('pointerup', endDrag);
		},
		[onPointerMove, endDrag],
	);

	const startResize = useCallback(
		(anchor: string, e: React.PointerEvent) => {
			e.preventDefault();
			e.stopPropagation();
			const box = boxes.find((b) => b.anchor === anchor);
			const startWidth = box?.rect.width ?? layout.regions.find((r) => r.anchor === anchor)?.widthPx ?? 200;
			dragState.current = {kind: 'resize', anchor, startX: e.clientX, startWidth};
			window.addEventListener('pointermove', onPointerMove);
			window.addEventListener('pointerup', endDrag);
		},
		[boxes, layout.regions, onPointerMove, endDrag],
	);

	return (
		<div className={styles.overlay} data-flx="ui-editor.region-overlay">
			<div className={styles.hint}>
				{picking ? (
					<>Click any part of the app to make it editable · Esc to stop</>
				) : (
					<>Drag to move · drag right edge to resize · 👁 hide</>
				)}
				<button
					className={picking ? styles.hintButtonActive : styles.hintButton}
					onClick={() => setPicking((v) => !v)}
				>
					{picking ? 'Picking…' : '+ Pick element'}
				</button>
				<button className={styles.hintButton} onClick={onClose}>
					Done
				</button>
			</div>

			{/* Hover highlight while picking */}
			{picking && hover && (
				<div
					className={styles.pickHighlight}
					style={{left: hover.rect.left, top: hover.rect.top, width: hover.rect.width, height: hover.rect.height}}
				>
					<span className={styles.pickTag}>{labelFor(hover.anchor)}</span>
				</div>
			)}

			{/* Editable region boxes (hidden while picking so they don't block clicks) */}
			{!picking &&
				boxes.map((b) => {
					const hidden = layout.regions.find((r) => r.anchor === b.anchor)?.hidden;
					return (
						<div
							key={b.anchor}
							className={`${styles.region} ${hidden ? styles.regionHidden : ''}`}
							style={{left: b.rect.left, top: b.rect.top, width: b.rect.width, height: b.rect.height}}
							onPointerDown={(e) => startMove(b.anchor, e)}
						>
							<span className={styles.regionTag}>{b.label}</span>
							<button
								className={styles.hideButton}
								title={hidden ? 'Show' : 'Hide'}
								onPointerDown={(e) => {
									e.preventDefault();
									e.stopPropagation();
								}}
								onClick={(e) => {
									e.stopPropagation();
									onToggleHide(b.anchor);
								}}
							>
								{hidden ? '🙈' : '👁'}
							</button>
							<div
								className={styles.resizeHandle}
								onPointerDown={(e) => startResize(b.anchor, e)}
								title="Resize width"
							/>
						</div>
					);
				})}
		</div>
	);
}
