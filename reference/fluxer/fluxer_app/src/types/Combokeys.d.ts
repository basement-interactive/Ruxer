// SPDX-License-Identifier: AGPL-3.0-or-later

declare module 'combokeys' {
	export interface CombokeysInstance {
		bind: (
			key: string,
			callback: (event?: KeyboardEvent | undefined) => void,
			action?: 'keydown' | 'keyup' | 'keypress',
		) => void;
		unbind: (key: string, action?: 'keydown' | 'keyup' | 'keypress') => void;
		detach: () => void;
		reset: () => void;
		stopCallback: () => boolean;
	}
	export interface CombokeysConstructor {
		new (element?: HTMLElement): CombokeysInstance;
	}
	const Combokeys: CombokeysConstructor;
	export default Combokeys;
}
