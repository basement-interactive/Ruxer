// SPDX-License-Identifier: AGPL-3.0-or-later

export function deferUntilModulesLoaded(setup: () => void): void {
	queueMicrotask(setup);
}
