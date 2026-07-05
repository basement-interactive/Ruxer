// SPDX-License-Identifier: AGPL-3.0-or-later

import AppStorage from '@app/features/platform/state/PersistentStorage';
import {Logger} from '@app/features/platform/utils/AppLogger';
import {configurePersistable, hydrateStore, makePersistable, stopPersisting} from 'mobx-persist-store';

const logger = new Logger('MobXPersistence');
const persistedStates = new Map<
	string,
	{
		stopSync?: () => void;
	}
>();
const getStorage = () => {
	return AppStorage;
};

const PERSIST_WRITE_DELAY_MS = 500;
const pendingPersistFlushes = new Set<() => void>();

function createPersistScheduler(delayMs: number): (callback: () => void) => void {
	if (delayMs <= 0) {
		return (callback) => {
			callback();
		};
	}
	return (callback) => {
		let settled = false;
		const flush = () => {
			if (settled) {
				return;
			}
			settled = true;
			pendingPersistFlushes.delete(flush);
			clearTimeout(timer);
			callback();
		};
		const timer = setTimeout(flush, delayMs);
		pendingPersistFlushes.add(flush);
	};
}

function flushPendingPersistWrites(): void {
	for (const flush of [...pendingPersistFlushes]) {
		flush();
	}
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
	window.addEventListener('pagehide', flushPendingPersistWrites);
	window.addEventListener('beforeunload', flushPendingPersistWrites);
}

configurePersistable(
	{
		storage: getStorage(),
		expireIn: undefined,
		removeOnExpiration: false,
		stringify: true,
		debugMode: false,
	},
	{
		scheduler: createPersistScheduler(PERSIST_WRITE_DELAY_MS),
	},
);

const hydrationPromises = new Map<string, Promise<void>>();

export function awaitHydration(storageKey: string): Promise<void> {
	return hydrationPromises.get(storageKey) ?? Promise.resolve();
}

export async function makePersistent<T extends object>(
	store: T,
	storageKey: string,
	properties: Array<keyof T>,
	options?: {
		expireIn?: number;
		removeOnExpiration?: boolean;
		version?: number;
		syncAcrossTabs?: boolean;
		writeDelayMs?: number;
	},
): Promise<void> {
	try {
		if (persistedStates.has(storageKey)) {
			logger.debug(`Store ${storageKey} is already being persisted, skipping...`);
			return;
		}
		const hydrationPromise = makePersistable(
			store,
			{
				name: storageKey,
				properties: properties as Array<keyof T & string>,
				storage: getStorage(),
				expireIn: options?.expireIn,
				removeOnExpiration: options?.removeOnExpiration,
				stringify: true,
				version: options?.version ?? 1,
			},
			options?.writeDelayMs === undefined ? undefined : {scheduler: createPersistScheduler(options.writeDelayMs)},
		).then(() => undefined);
		hydrationPromises.set(storageKey, hydrationPromise);
		await hydrationPromise;
		let stopSync: (() => void) | undefined;
		if (options?.syncAcrossTabs) {
			let hydrationQueue = Promise.resolve();
			stopSync = AppStorage.subscribe(
				() => {
					hydrationQueue = hydrationQueue
						.catch(() => undefined)
						.then(async () => {
							logger.debug(`Rehydrating store ${storageKey} after external storage change.`);
							await hydrateStore(store);
						})
						.catch((error) => {
							logger.error(`Failed to rehydrate store ${storageKey} after external storage change:`, error);
						});
				},
				{
					key: storageKey,
					source: 'external',
				},
			);
		}
		persistedStates.set(storageKey, {stopSync});
		logger.debug(`Store ${storageKey} hydrated from AppStorage and is now persisting.`);
	} catch (error) {
		logger.error(`Failed to hydrate store ${storageKey}:`, error);
	}
}

export function stopPersistent(storageKey: string, store: object): void {
	try {
		const persistedState = persistedStates.get(storageKey);
		persistedState?.stopSync?.();
		stopPersisting(store);
		persistedStates.delete(storageKey);
		logger.debug(`Stopped persisting store: ${storageKey}`);
	} catch (error) {
		logger.error(`Failed to stop persisting store ${storageKey}:`, error);
	}
}
