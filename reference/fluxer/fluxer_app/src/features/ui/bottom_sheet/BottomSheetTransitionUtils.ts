// SPDX-License-Identifier: AGPL-3.0-or-later

const BOTTOM_SHEET_HISTORY_SETTLE_FALLBACK_MS = 250;

interface BottomSheetHistoryState {
	bottomSheet?: unknown;
}

function hasActiveBottomSheetHistoryEntry(): boolean {
	if (typeof window === 'undefined') {
		return false;
	}
	const state = window.history.state as BottomSheetHistoryState | null;
	return Boolean(state && typeof state === 'object' && typeof state.bottomSheet === 'string');
}

export function closeBottomSheetThen(onClose: () => void, action: () => void): void {
	if (typeof window === 'undefined' || !hasActiveBottomSheetHistoryEntry()) {
		onClose();
		action();
		return;
	}
	let fallbackTimerId: number | undefined;
	let didRun = false;
	const run = () => {
		if (didRun) return;
		didRun = true;
		window.removeEventListener('popstate', handlePopState);
		if (fallbackTimerId !== undefined) {
			window.clearTimeout(fallbackTimerId);
		}
		window.setTimeout(action, 0);
	};
	const runIfHistorySettled = () => {
		if (!hasActiveBottomSheetHistoryEntry()) {
			run();
		}
	};
	const handlePopState = () => {
		window.setTimeout(runIfHistorySettled, 0);
	};
	window.addEventListener('popstate', handlePopState);
	onClose();
	window.setTimeout(runIfHistorySettled, 0);
	fallbackTimerId = window.setTimeout(run, BOTTOM_SHEET_HISTORY_SETTLE_FALLBACK_MS);
}
