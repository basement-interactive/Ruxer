// SPDX-License-Identifier: AGPL-3.0-or-later

import {Logger} from '@app/features/platform/utils/AppLogger';
import Window from '@app/features/window/state/Window';
import {autorun} from 'mobx';

type FocusChangeListener = (focused: boolean) => void;

class FocusManager {
	private static instance: FocusManager;
	private listeners: Set<FocusChangeListener> = new Set();
	private initialized = false;
	private disposer: (() => void) | null = null;
	private logger = new Logger('FocusManager');

	static getInstance(): FocusManager {
		if (!FocusManager.instance) {
			FocusManager.instance = new FocusManager();
		}
		return FocusManager.instance;
	}

	init(): void {
		if (this.initialized) return;
		this.initialized = true;
		this.disposer = autorun(() => {
			this.notifyListeners(this.isForeground());
		});
	}

	destroy(): void {
		this.listeners.clear();
		this.disposer?.();
		this.disposer = null;
		this.initialized = false;
	}

	subscribe(listener: FocusChangeListener): () => void {
		this.listeners.add(listener);
		listener(this.isForeground());
		return () => {
			this.listeners.delete(listener);
		};
	}

	private notifyListeners(focused: boolean): void {
		this.listeners.forEach((listener) => {
			try {
				listener(focused);
			} catch (error) {
				this.logger.error('FocusManager: Error in listener:', error);
			}
		});
	}

	private isForeground(): boolean {
		return Window.isFocused() && Window.isVisible();
	}

	isFocused(): boolean {
		return Window.isFocused() && Window.isVisible();
	}
}

export default FocusManager.getInstance();
