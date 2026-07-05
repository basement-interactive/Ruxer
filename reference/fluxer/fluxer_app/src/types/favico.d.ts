// SPDX-License-Identifier: AGPL-3.0-or-later

declare module 'favico.js' {
	export interface FavicoOptions {
		animation?: string;
		bgColor?: string;
		textColor?: string;
		fontFamily?: string;
		fontStyle?: string;
		type?: string;
		position?: string;
		element?: HTMLElement;
		elementId?: string;
		dataUrl?: (url: string) => void;
	}
	export default class Favico {
		constructor(options?: FavicoOptions);

		badge(count: number | string): void;

		reset(): void;

		image(image: HTMLImageElement | HTMLCanvasElement): void;

		video(video: HTMLVideoElement): void;

		webcam(): void;
	}
}
