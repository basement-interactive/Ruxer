// SPDX-License-Identifier: AGPL-3.0-or-later

import type React from 'react';

export type BrandSvgProps = React.SVGProps<SVGSVGElement>;

export function getDataFlx(props: BrandSvgProps, fallback: string): string {
	return ((props as {'data-flx'?: string})['data-flx'] ?? fallback) as string;
}

export function getImageSizingProps(
	props: BrandSvgProps,
): Pick<React.ImgHTMLAttributes<HTMLImageElement>, 'className' | 'height' | 'style' | 'width'> {
	const {className, height, style, width} = props;
	return {
		className,
		height: height as number | string | undefined,
		style: style as React.CSSProperties | undefined,
		width: width as number | string | undefined,
	};
}
