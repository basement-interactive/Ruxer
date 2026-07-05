// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	getColorWithHue,
	getColorWithSaturationBrightness,
	getUnitPointFromClientPosition,
	getUnitValueFromClientX,
	shouldSyncPickerColorFromProp,
} from '@app/features/app/components/floating/ColorPickerMath';
import styles from '@app/features/app/components/floating/ColorPickerPopover.module.css';
import FocusRing from '@app/features/ui/focus_ring/FocusRing';
import {Trans} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
	type Color,
	ColorArea,
	ColorPicker,
	ColorSlider,
	ColorThumb,
	parseColor,
	SliderTrack,
} from 'react-aria-components';

type DragTarget = 'color-area' | 'hue-slider';

export const ColorPickerPopover = observer(
	({
		color,
		onChange,
		onReset,
	}: {
		popoutKey?: string | number;
		color: string;
		onChange: (color: string) => void;
		onReset: () => void;
	}) => {
		const hasCustomColor = color !== null && color !== '#4641D9';
		const parsedColor = useMemo(() => {
			try {
				return parseColor(color).toFormat('hsb');
			} catch {
				return parseColor('#4641D9').toFormat('hsb');
			}
		}, [color]);
		const activeDragRef = useRef<{pointerId: number; target: DragTarget} | null>(null);
		const colorRef = useRef<Color>(parsedColor);
		const [pickerColor, setPickerColor] = useState(parsedColor);
		const handleColorChange = useCallback(
			(newColor: Color) => {
				colorRef.current = newColor;
				setPickerColor(newColor);
				onChange(newColor.toString('hex'));
			},
			[onChange],
		);
		useEffect(() => {
			if (!shouldSyncPickerColorFromProp(parsedColor, colorRef.current)) return;
			colorRef.current = parsedColor;
			setPickerColor(parsedColor);
		}, [parsedColor]);
		const focusGestureInput = useCallback((element: HTMLElement) => {
			element.querySelector<HTMLInputElement>('input')?.focus({preventScroll: true});
		}, []);
		const updateColorAreaFromPointer = useCallback(
			(clientX: number, clientY: number, element: HTMLElement) => {
				const point = getUnitPointFromClientPosition(clientX, clientY, element.getBoundingClientRect());
				if (!point) return;
				handleColorChange(getColorWithSaturationBrightness(colorRef.current, point));
			},
			[handleColorChange],
		);
		const updateHueFromPointer = useCallback(
			(clientX: number, element: HTMLElement) => {
				const unitValue = getUnitValueFromClientX(clientX, element.getBoundingClientRect());
				if (unitValue === null) return;
				handleColorChange(getColorWithHue(colorRef.current, unitValue));
			},
			[handleColorChange],
		);
		const capturePointer = useCallback(
			(event: React.PointerEvent<HTMLElement>, target: DragTarget) => {
				if (event.pointerType === 'mouse' && (event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey)) {
					return;
				}
				event.preventDefault();
				event.stopPropagation();
				const element = event.currentTarget;
				activeDragRef.current = {pointerId: event.pointerId, target};
				element.setPointerCapture?.(event.pointerId);
				focusGestureInput(element);
				if (target === 'color-area') {
					updateColorAreaFromPointer(event.clientX, event.clientY, element);
				} else {
					updateHueFromPointer(event.clientX, element);
				}
			},
			[focusGestureInput, updateColorAreaFromPointer, updateHueFromPointer],
		);
		const updateCapturedPointer = useCallback(
			(event: React.PointerEvent<HTMLElement>, target: DragTarget) => {
				const activeDrag = activeDragRef.current;
				if (!activeDrag || activeDrag.pointerId !== event.pointerId || activeDrag.target !== target) return;
				event.preventDefault();
				event.stopPropagation();
				if (target === 'color-area') {
					updateColorAreaFromPointer(event.clientX, event.clientY, event.currentTarget);
				} else {
					updateHueFromPointer(event.clientX, event.currentTarget);
				}
			},
			[updateColorAreaFromPointer, updateHueFromPointer],
		);
		const releaseCapturedPointer = useCallback(
			(event: React.PointerEvent<HTMLElement>, target: DragTarget) => {
				const activeDrag = activeDragRef.current;
				if (!activeDrag || activeDrag.pointerId !== event.pointerId || activeDrag.target !== target) return;
				event.preventDefault();
				event.stopPropagation();
				if (target === 'color-area') {
					updateColorAreaFromPointer(event.clientX, event.clientY, event.currentTarget);
				} else {
					updateHueFromPointer(event.clientX, event.currentTarget);
				}
				activeDragRef.current = null;
				if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
					event.currentTarget.releasePointerCapture(event.pointerId);
				}
			},
			[updateColorAreaFromPointer, updateHueFromPointer],
		);
		return (
			<div className={styles.container} data-flx="app.floating.color-picker-popover.container">
				<ColorPicker
					value={pickerColor}
					onChange={handleColorChange}
					data-flx="app.floating.color-picker-popover.color-picker.color-change"
				>
					<div
						className={hasCustomColor ? styles.pickerContainerWithMargin : styles.pickerContainer}
						data-flx="app.floating.color-picker-popover.picker-container"
					>
						<div className={styles.pickerWrapper} data-flx="app.floating.color-picker-popover.picker-wrapper">
							<ColorArea
								colorSpace="hsb"
								xChannel="saturation"
								yChannel="brightness"
								className={styles.colorArea}
								onPointerDownCapture={(event) => capturePointer(event, 'color-area')}
								onPointerMoveCapture={(event) => updateCapturedPointer(event, 'color-area')}
								onPointerUpCapture={(event) => releaseCapturedPointer(event, 'color-area')}
								onPointerCancelCapture={(event) => releaseCapturedPointer(event, 'color-area')}
								onLostPointerCaptureCapture={(event) => releaseCapturedPointer(event, 'color-area')}
								data-flx="app.floating.color-picker-popover.color-area"
							>
								<ColorThumb className={styles.colorThumb} data-flx="app.floating.color-picker-popover.color-thumb" />
							</ColorArea>
							<ColorSlider
								channel="hue"
								className={styles.colorSlider}
								data-flx="app.floating.color-picker-popover.color-slider"
							>
								<SliderTrack
									className={styles.sliderTrack}
									onPointerDownCapture={(event) => capturePointer(event, 'hue-slider')}
									onPointerMoveCapture={(event) => updateCapturedPointer(event, 'hue-slider')}
									onPointerUpCapture={(event) => releaseCapturedPointer(event, 'hue-slider')}
									onPointerCancelCapture={(event) => releaseCapturedPointer(event, 'hue-slider')}
									onLostPointerCaptureCapture={(event) => releaseCapturedPointer(event, 'hue-slider')}
									data-flx="app.floating.color-picker-popover.slider-track"
								>
									<ColorThumb
										className={styles.colorThumb}
										data-flx="app.floating.color-picker-popover.color-thumb--2"
									/>
								</SliderTrack>
							</ColorSlider>
						</div>
					</div>
				</ColorPicker>
				<FocusRing offset={-2} data-flx="app.floating.color-picker-popover.focus-ring">
					<button
						type="button"
						className={styles.resetButton}
						onClick={onReset}
						disabled={!hasCustomColor}
						data-flx="app.floating.color-picker-popover.reset-button"
					>
						<span className={styles.resetButtonText} data-flx="app.floating.color-picker-popover.reset-button-text">
							<Trans>Reset</Trans>
						</span>
					</button>
				</FocusRing>
			</div>
		);
	},
);
