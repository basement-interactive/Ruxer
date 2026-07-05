// SPDX-License-Identifier: AGPL-3.0-or-later

import {Logger} from '@app/features/platform/utils/AppLogger';
import {makeAutoObservable} from 'mobx';

const logger = new Logger('Window');

interface WindowSize {
	width: number;
	height: number;
}

const getWindowSize = (): WindowSize => ({
	width: window.innerWidth,
	height: window.innerHeight,
});
const getInitialFocused = (): boolean => document.hasFocus();
const getInitialVisible = (): boolean => !document.hidden;

function generateWindowId(): string {
	return `window-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

class Window {
	focused = getInitialFocused();
	visible = getInitialVisible();
	windowSize: WindowSize = getWindowSize();
	windowId: string = generateWindowId();
	lastFocusedAt: number = Date.now();
	createdAt: number = Date.now();

	constructor() {
		makeAutoObservable(this, {}, {autoBind: true});
		this.initListeners();
	}

	private initListeners(): void {
		window.addEventListener('focus', () => this.setFocused(true));
		window.addEventListener('blur', () => this.setFocused(false));
		document.addEventListener('visibilitychange', () => {
			this.setVisible(!document.hidden);
		});
		window.addEventListener('resize', () => this.updateWindowSize());
	}

	setFocused(focused: boolean): void {
		if (this.focused !== focused) {
			logger.debug(`Window focus changed: ${focused}`);
			this.focused = focused;
			if (focused) {
				this.lastFocusedAt = Date.now();
			}
		}
	}

	setVisible(visible: boolean): void {
		if (this.visible !== visible) {
			logger.debug(`Window visibility changed: ${visible}`);
			this.visible = visible;
		}
	}

	updateWindowSize(): void {
		this.windowSize = getWindowSize();
		logger.debug(`Window resized: ${this.windowSize.width}x${this.windowSize.height}`);
	}

	isFocused(): boolean {
		return this.focused;
	}

	isVisible(): boolean {
		return this.visible;
	}

	getWindowSize(): WindowSize {
		return this.windowSize;
	}
}

export default new Window();
