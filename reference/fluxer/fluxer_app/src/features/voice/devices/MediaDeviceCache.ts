// SPDX-License-Identifier: AGPL-3.0-or-later

type MediaDeviceCacheKind = 'audio' | 'video';

interface CachedDeviceEntry {
	devices: Array<MediaDeviceInfo>;
	fetchedAt: number;
}

type DeviceFetcher = () => Promise<Array<MediaDeviceInfo>>;

const DEVICE_CACHE_TTL_MS = 30_000;

class MediaDeviceCache {
	private cache = new Map<MediaDeviceCacheKind, CachedDeviceEntry>();
	private pending = new Map<MediaDeviceCacheKind, Promise<CachedDeviceEntry>>();
	private revision = 0;

	async getDevices(type: MediaDeviceCacheKind, fetchDevices: DeviceFetcher): Promise<CachedDeviceEntry> {
		const cached = this.cache.get(type);
		if (cached && Date.now() - cached.fetchedAt < DEVICE_CACHE_TTL_MS) {
			return cached;
		}
		const pending = this.pending.get(type);
		if (pending) {
			return pending;
		}
		const requestRevision = this.revision;
		const request = fetchDevices()
			.then((devices) => {
				const entry = {devices, fetchedAt: Date.now()};
				if (this.revision === requestRevision) {
					this.cache.set(type, entry);
				}
				return entry;
			})
			.finally(() => {
				this.pending.delete(type);
			});
		this.pending.set(type, request);
		return request;
	}

	invalidate(type: MediaDeviceCacheKind): void {
		this.revision += 1;
		this.cache.delete(type);
		this.pending.delete(type);
	}

	invalidateAll(): void {
		this.revision += 1;
		this.cache.clear();
		this.pending.clear();
	}

	startDeviceChangeListener(): () => void {
		return () => {};
	}
}

export const mediaDeviceCache = new MediaDeviceCache();
