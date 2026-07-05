// SPDX-License-Identifier: AGPL-3.0-or-later

import * as RouterUtils from '@app/features/navigation/utils/RouterUtils';
import {useEffect, useRef} from 'react';

let globalCleanupInProgress = false;

interface ModalHistoryState {
	modal?: unknown;
}

function getModalHistoryId(state: unknown): string | null {
	if (!state || typeof state !== 'object') {
		return null;
	}
	const modal = (state as ModalHistoryState).modal;
	return typeof modal === 'string' ? modal : null;
}

function withModalHistoryId(state: unknown, modalHistoryId: string): Record<string, unknown> {
	const nextState = state && typeof state === 'object' ? {...(state as Record<string, unknown>)} : {};
	nextState.modal = modalHistoryId;
	return nextState;
}

function withoutModalHistoryId(state: unknown): unknown {
	if (!state || typeof state !== 'object' || !('modal' in state)) {
		return state ?? null;
	}
	const nextState = {...(state as Record<string, unknown>)};
	delete nextState.modal;
	return Object.keys(nextState).length > 0 ? nextState : null;
}

function sameHistoryUrl(a: URL, b: URL): boolean {
	return a.pathname === b.pathname && a.search === b.search && a.hash === b.hash;
}

export function useModalBackHandler(onClose: () => void, disableHistoryManagement = false): void {
	const historyEntryPushedRef = useRef(false);
	const closedViaBackButtonRef = useRef(false);
	const mountedRef = useRef(false);
	const restoreTimerRef = useRef<number | null>(null);
	const onCloseRef = useRef(onClose);
	useEffect(() => {
		onCloseRef.current = onClose;
	}, [onClose]);
	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
			if (restoreTimerRef.current !== null && typeof window !== 'undefined') {
				window.clearTimeout(restoreTimerRef.current);
				restoreTimerRef.current = null;
			}
		};
	}, []);
	useEffect(() => {
		if (disableHistoryManagement || typeof window === 'undefined') {
			return;
		}
		if (historyEntryPushedRef.current) {
			return;
		}
		const history = RouterUtils.getHistory();
		if (!history) {
			return;
		}
		const modalHistoryId = `modal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
		const initialLocation = history.getLocation();
		const entryUrl = new URL(initialLocation.url.toString());
		history.push(entryUrl, withModalHistoryId(initialLocation.state, modalHistoryId));
		historyEntryPushedRef.current = true;
		closedViaBackButtonRef.current = false;
		const restoreHistoryEntryIfStillOpen = () => {
			if (!mountedRef.current || historyEntryPushedRef.current) {
				return;
			}
			const currentHistory = RouterUtils.getHistory();
			if (!currentHistory) {
				return;
			}
			const location = currentHistory.getLocation();
			if (!sameHistoryUrl(location.url, entryUrl)) {
				return;
			}
			const activeModalHistoryId = getModalHistoryId(location.state);
			if (activeModalHistoryId === modalHistoryId) {
				historyEntryPushedRef.current = true;
				closedViaBackButtonRef.current = false;
				return;
			}
			currentHistory.push(location.url, withModalHistoryId(location.state, modalHistoryId));
			historyEntryPushedRef.current = true;
			closedViaBackButtonRef.current = false;
		};
		const handlePopState = (event: PopStateEvent) => {
			if (globalCleanupInProgress) {
				return;
			}
			if (!historyEntryPushedRef.current) {
				return;
			}
			const modalHistoryIdFromState = getModalHistoryId(event.state);
			if (modalHistoryIdFromState === modalHistoryId) {
				return;
			}
			closedViaBackButtonRef.current = true;
			historyEntryPushedRef.current = false;
			onCloseRef.current();
			if (restoreTimerRef.current !== null) {
				window.clearTimeout(restoreTimerRef.current);
			}
			restoreTimerRef.current = window.setTimeout(() => {
				restoreTimerRef.current = null;
				restoreHistoryEntryIfStillOpen();
			}, 0);
		};
		window.addEventListener('popstate', handlePopState);
		return () => {
			if (restoreTimerRef.current !== null) {
				window.clearTimeout(restoreTimerRef.current);
				restoreTimerRef.current = null;
			}
			const currentHistory = RouterUtils.getHistory();
			if (!currentHistory) {
				window.removeEventListener('popstate', handlePopState);
				return;
			}
			const location = currentHistory.getLocation();
			const activeModalHistoryId = getModalHistoryId(location.state);
			const isActiveModalHistoryEntry = activeModalHistoryId === modalHistoryId;
			const isStillOnModalUrl = sameHistoryUrl(location.url, entryUrl);
			if (
				historyEntryPushedRef.current &&
				!closedViaBackButtonRef.current &&
				isActiveModalHistoryEntry &&
				isStillOnModalUrl
			) {
				historyEntryPushedRef.current = false;
				globalCleanupInProgress = true;
				window.removeEventListener('popstate', handlePopState);
				currentHistory.back();
				window.setTimeout(() => {
					globalCleanupInProgress = false;
				}, 100);
			} else if (!closedViaBackButtonRef.current && isActiveModalHistoryEntry) {
				historyEntryPushedRef.current = false;
				window.removeEventListener('popstate', handlePopState);
				currentHistory.replace(location.url, withoutModalHistoryId(location.state));
			} else {
				window.removeEventListener('popstate', handlePopState);
			}
		};
	}, [disableHistoryManagement]);
}
