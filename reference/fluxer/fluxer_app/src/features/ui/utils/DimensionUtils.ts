// SPDX-License-Identifier: AGPL-3.0-or-later

import {remFromPx} from '@app/features/theme/layout/RemFromPx';
import type {CSSProperties} from 'react';

interface MediaDimensions {
	width: number;
	height: number;
}

interface DimensionOptions {
	maxWidth?: number;
	maxHeight?: number;
	preserve?: boolean;
	forceScale?: boolean;
	aspectRatio?: boolean;
	responsive?: boolean;
}

interface DimensionResult {
	style: CSSProperties;
	dimensions: MediaDimensions;
	scale: number;
}

const DEFAULT_OPTIONS: Required<DimensionOptions> = {
	maxWidth: 550,
	maxHeight: 400,
	preserve: false,
	forceScale: false,
	aspectRatio: true,
	responsive: true,
};

export class MediaDimensionCalculator {
	private options: Required<DimensionOptions>;

	constructor(options?: DimensionOptions) {
		this.options = {...DEFAULT_OPTIONS, ...options};
	}

	public calculate(dimensions: MediaDimensions, options?: DimensionOptions): DimensionResult {
		const config = {...this.options, ...options};
		const safeDimensions = this.normalizeDimensions(dimensions);
		if (config.preserve) {
			return this.preserveDimensions(safeDimensions);
		}
		if (config.forceScale) {
			return this.forceScaleDimensions(safeDimensions, config);
		}
		return this.calculateResponsiveDimensions(safeDimensions, config);
	}

	public calculateImage(dimensions: MediaDimensions, options?: Omit<DimensionOptions, 'forceScale'>): DimensionResult {
		return this.calculate(dimensions, {...options, forceScale: false});
	}

	public calculateVideo(dimensions: MediaDimensions, options?: Omit<DimensionOptions, 'preserve'>): DimensionResult {
		return this.calculate(dimensions, {...options, preserve: false});
	}

	private preserveDimensions(dimensions: MediaDimensions): DimensionResult {
		return {
			style: {
				width: remFromPx(dimensions.width),
				aspectRatio: `${dimensions.width}/${dimensions.height}`,
			},
			dimensions: {...dimensions},
			scale: 1,
		};
	}

	private forceScaleDimensions(dimensions: MediaDimensions, options: Required<DimensionOptions>): DimensionResult {
		const maxWidth = this.normalizeLimit(options.maxWidth, DEFAULT_OPTIONS.maxWidth);
		const maxHeight = this.normalizeLimit(options.maxHeight, DEFAULT_OPTIONS.maxHeight);
		const scale = Math.min(1, maxWidth / dimensions.width, maxHeight / dimensions.height);
		const scaledDimensions = {
			width: Math.max(1, Math.round(dimensions.width * scale)),
			height: Math.max(1, Math.round(dimensions.height * scale)),
		};
		return {
			style: {
				width: `min(100%, ${remFromPx(scaledDimensions.width)})`,
				height: 'auto',
				maxWidth: '100%',
				maxHeight: '100%',
				...(options.aspectRatio && {
					aspectRatio: `${scaledDimensions.width}/${scaledDimensions.height}`,
				}),
			},
			dimensions: scaledDimensions,
			scale,
		};
	}

	private calculateResponsiveDimensions(
		dimensions: MediaDimensions,
		options: Required<DimensionOptions>,
	): DimensionResult {
		const maxWidth = this.normalizeLimit(options.maxWidth, DEFAULT_OPTIONS.maxWidth);
		const maxHeight = this.normalizeLimit(options.maxHeight, DEFAULT_OPTIONS.maxHeight);
		const isPortrait = dimensions.height > dimensions.width;
		let style: CSSProperties;
		let scaledDimensions: MediaDimensions;
		let scale: number;
		if (isPortrait) {
			const targetWidth = Math.max(1, Math.round((maxHeight * dimensions.width) / dimensions.height));
			const maxAllowedWidth = Math.max(1, Math.min(dimensions.width, maxWidth, targetWidth));
			scale = maxAllowedWidth / dimensions.width;
			scaledDimensions = {
				width: maxAllowedWidth,
				height: Math.max(1, Math.round(dimensions.height * scale)),
			};
			style = {
				maxWidth: `min(100%, ${remFromPx(maxAllowedWidth)})`,
				width: options.responsive ? '100%' : `min(100%, ${remFromPx(maxAllowedWidth)})`,
				...(options.aspectRatio && {
					aspectRatio: `${scaledDimensions.width}/${scaledDimensions.height}`,
				}),
			};
		} else {
			const scaleByWidth = maxWidth / dimensions.width;
			const scaleByHeight = maxHeight / dimensions.height;
			scale = Math.min(1, scaleByWidth, scaleByHeight);
			scaledDimensions = {
				width: Math.max(1, Math.round(dimensions.width * scale)),
				height: Math.max(1, Math.round(dimensions.height * scale)),
			};
			style = {
				maxWidth: `min(100%, ${remFromPx(maxWidth)})`,
				width: options.responsive ? '100%' : `min(100%, ${remFromPx(scaledDimensions.width)})`,
				...(options.aspectRatio && {
					aspectRatio: `${scaledDimensions.width}/${scaledDimensions.height}`,
				}),
			};
		}
		return {style, dimensions: scaledDimensions, scale};
	}

	private normalizeDimensions(dimensions: MediaDimensions): MediaDimensions {
		return {
			width: this.normalizeLimit(dimensions.width, 1),
			height: this.normalizeLimit(dimensions.height, 1),
		};
	}

	private normalizeLimit(value: number, fallback: number): number {
		if (!Number.isFinite(value) || value <= 0) {
			return fallback;
		}
		return value;
	}

	public static scale(
		width: number,
		height: number,
		maxWidth = DEFAULT_OPTIONS.maxWidth,
		maxHeight = DEFAULT_OPTIONS.maxHeight,
	): [number, number] {
		const calculator = new MediaDimensionCalculator();
		const result = calculator.calculate({width, height}, {maxWidth, maxHeight, forceScale: true});
		return [result.dimensions.width, result.dimensions.height];
	}
}

export function createCalculator(options?: DimensionOptions): MediaDimensionCalculator {
	return new MediaDimensionCalculator(options);
}
