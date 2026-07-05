// SPDX-License-Identifier: AGPL-3.0-or-later

import {getProtectedIndexedDB} from '@app/features/platform/state/ProtectedWebStorage';
import {Logger} from '@app/features/platform/utils/AppLogger';

const logger = new Logger('VoiceStatsDB');
const DB_NAME = 'FluxerVoiceStats';
const DB_VERSION = 1;
const STORE_NAME = 'stats';
const browserIndexedDB = getProtectedIndexedDB();

interface StatEntry {
	reportId: string;
	bytes: number;
	timestamp: number;
}

const IDB_TIMEOUT = 5000;

class VoiceStatsDB {
	private db: IDBDatabase | null = null;
	private initPromise: Promise<void> | null = null;
	private initFailed = false;

	async init(): Promise<void> {
		if (this.initFailed) return;
		if (this.initPromise) return this.initPromise;
		const openPromise = new Promise<void>((resolve, reject) => {
			if (!browserIndexedDB) {
				resolve();
				return;
			}
			const request = browserIndexedDB.open(DB_NAME, DB_VERSION);
			request.onerror = () => {
				logger.error('Failed to open IndexedDB', request.error);
				reject(request.error);
			};
			request.onblocked = () => {
				logger.warn('VoiceStatsDB: IndexedDB blocked');
				reject(new Error('IndexedDB blocked'));
			};
			request.onsuccess = () => {
				this.db = request.result;
				resolve();
			};
			request.onupgradeneeded = (event) => {
				const db = (event.target as IDBOpenDBRequest).result;
				if (!db.objectStoreNames.contains(STORE_NAME)) {
					db.createObjectStore(STORE_NAME, {keyPath: 'reportId'});
				}
			};
		});
		const timeoutPromise = new Promise<void>((_, reject) => {
			setTimeout(() => reject(new Error('VoiceStatsDB init timeout')), IDB_TIMEOUT);
		});
		this.initPromise = Promise.race([openPromise, timeoutPromise]).catch((err) => {
			logger.warn('VoiceStatsDB init failed, will use no-op mode', err);
			this.initFailed = true;
		});
		return this.initPromise;
	}

	async set(reportId: string, bytes: number, timestamp: number): Promise<void> {
		await this.init();
		if (!this.db) return;
		return new Promise((resolve, reject) => {
			const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
			const store = transaction.objectStore(STORE_NAME);
			const entry: StatEntry = {reportId, bytes, timestamp};
			const request = store.put(entry);
			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
		});
	}

	async get(reportId: string): Promise<{
		bytes: number;
		timestamp: number;
	} | null> {
		await this.init();
		if (!this.db) return null;
		return new Promise((resolve, reject) => {
			const transaction = this.db!.transaction([STORE_NAME], 'readonly');
			const store = transaction.objectStore(STORE_NAME);
			const request = store.get(reportId);
			request.onsuccess = () => {
				const entry = request.result as StatEntry | undefined;
				if (entry) {
					resolve({bytes: entry.bytes, timestamp: entry.timestamp});
				} else {
					resolve(null);
				}
			};
			request.onerror = () => reject(request.error);
		});
	}

	async clear(): Promise<void> {
		await this.init();
		if (!this.db) return;
		return new Promise((resolve, reject) => {
			const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
			const store = transaction.objectStore(STORE_NAME);
			const request = store.clear();
			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
		});
	}

	async clearOldEntries(maxAgeMs: number): Promise<void> {
		await this.init();
		if (!this.db) return;
		const cutoffTime = Date.now() - maxAgeMs;
		return new Promise((resolve, reject) => {
			const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
			const store = transaction.objectStore(STORE_NAME);
			const request = store.openCursor();
			request.onsuccess = (event) => {
				const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
				if (cursor) {
					const entry = cursor.value as StatEntry;
					if (entry.timestamp < cutoffTime) {
						cursor.delete();
					}
					cursor.continue();
				} else {
					resolve();
				}
			};
			request.onerror = () => reject(request.error);
		});
	}
}

export const voiceStatsDB = new VoiceStatsDB();
