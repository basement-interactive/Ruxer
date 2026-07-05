// SPDX-License-Identifier: AGPL-3.0-or-later

import Config from '@app/features/app/config/Config';
import {isSvgMimeType, normalizeImageMimeType} from '@app/features/expressions/utils/ImageUploadFileUtils';
import AppStorage from '@app/features/platform/state/PersistentStorage';
import {useEffect, useState, useSyncExternalStore} from 'react';

export type MediaFormat = 'avif' | 'webp' | 'apng' | 'jxl';

export interface CapabilityResult {
	avif: boolean;
	webp: boolean;
	apng: boolean;
	jxl: boolean;
	probedAt: number;
	uaKey: string;
}

const AVIF_PROBE =
	'data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAAB0AAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAEAAAABAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQAMAAAAABNjb2xybmNseAACAAIABoAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAACVtZGF0EgAKCBgIYAQQUDAJEBQYJlAQUAAAAB1FmDuOmIs=';
const WEBP_PROBE = 'data:image/webp;base64,UklGRhwAAABXRUJQVlA4TBAAAAAvAAAAAAfQ//73v/+BiOh/AAA=';
const APNG_PROBE =
	'data:image/apng;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACGFjVEwAAAABAAAAALOZWzgAAAANSURBVAjXY/j//z8DAAj8Av6IXwbgAAAAAElFTkSuQmCC';
const JXL_PROBE = 'data:image/jxl;base64,/wr6PwH4TWFvLnVMkM4=';
const STORAGE_KEY = 'fluxer:media_caps:v1';
const PROBE_TIMEOUT_MS = 1500;

function buildUaKey(): string {
	const ua = typeof navigator !== 'undefined' ? navigator.userAgent : 'ssr';
	const version = Config.PUBLIC_BUILD_VERSION ?? 'dev';
	return `${version}:${ua}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function probeOne(dataUrl: string): Promise<boolean> {
	if (typeof window === 'undefined' || typeof Image === 'undefined') return false;
	const img = new Image();
	img.src = dataUrl;
	const decoded = (async () => {
		if (typeof img.decode === 'function') {
			try {
				await img.decode();
				return img.naturalWidth > 0;
			} catch {
				return false;
			}
		}
		return new Promise<boolean>((resolve) => {
			img.onload = () => resolve(img.naturalWidth > 0);
			img.onerror = () => resolve(false);
		});
	})();
	const timeout = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), PROBE_TIMEOUT_MS));
	return Promise.race([decoded, timeout]);
}

function readCached(): CapabilityResult | null {
	try {
		const raw = AppStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		const parsed: unknown = JSON.parse(raw);
		if (!isRecord(parsed)) return null;
		if (parsed.uaKey !== buildUaKey()) return null;
		return {
			avif: parsed.avif === true,
			webp: parsed.webp === true,
			apng: parsed.apng === true,
			jxl: parsed.jxl === true,
			probedAt: typeof parsed.probedAt === 'number' ? parsed.probedAt : 0,
			uaKey: parsed.uaKey,
		};
	} catch {
		return null;
	}
}

function writeCached(result: CapabilityResult): void {
	try {
		AppStorage.setItem(STORAGE_KEY, JSON.stringify(result));
	} catch {}
}

let cached: CapabilityResult | null = null;
let inflight: Promise<CapabilityResult> | null = null;

const listeners = new Set<() => void>();

function notify(): void {
	for (const fn of listeners) fn();
}

async function runProbes(): Promise<CapabilityResult> {
	const [avif, webp, apng, jxl] = await Promise.all([
		probeOne(AVIF_PROBE),
		probeOne(WEBP_PROBE),
		probeOne(APNG_PROBE),
		probeOne(JXL_PROBE),
	]);
	return {avif, webp, apng, jxl, probedAt: Date.now(), uaKey: buildUaKey()};
}

export async function probeMediaCapabilities(): Promise<CapabilityResult> {
	if (cached) return cached;
	const fromStorage = readCached();
	if (fromStorage) {
		cached = fromStorage;
		notify();
		return fromStorage;
	}
	if (inflight) return inflight;
	inflight = (async () => {
		const result = await runProbes();
		cached = result;
		writeCached(result);
		notify();
		inflight = null;
		return result;
	})();
	return inflight;
}

export function getMediaCapabilitiesSync(): CapabilityResult | null {
	if (cached) return cached;
	cached = readCached();
	return cached;
}

type CroppableAssetKind = 'avatar' | 'guild_icon' | 'banner' | 'splash' | 'embed_splash' | 'emoji' | 'sticker';

function pickAnimated(kind: CroppableAssetKind, caps: CapabilityResult): MediaFormat | null {
	switch (kind) {
		case 'emoji':
		case 'sticker':
		case 'avatar':
		case 'guild_icon':
		case 'banner':
		case 'splash':
		case 'embed_splash':
			if (caps.webp) return 'webp';
			if (caps.apng) return 'apng';
			return null;
	}
}

function pickStatic(kind: CroppableAssetKind, caps: CapabilityResult): MediaFormat | null {
	switch (kind) {
		case 'avatar':
		case 'guild_icon':
		case 'banner':
		case 'splash':
		case 'embed_splash':
			if (caps.avif) return 'avif';
			if (caps.webp) return 'webp';
			return null;
		case 'emoji':
		case 'sticker':
			if (caps.webp) return 'webp';
			if (caps.avif) return 'avif';
			return null;
	}
}

export const MediaCapabilities = {
	probe: probeMediaCapabilities,
	getSync: getMediaCapabilitiesSync,
	bestFormatFor(kind: CroppableAssetKind, animated: boolean): MediaFormat | null {
		const caps = getMediaCapabilitiesSync();
		if (!caps) return null;
		return animated ? pickAnimated(kind, caps) : pickStatic(kind, caps);
	},
	canCropFormat,
};

export async function canCropFormat(mime: string): Promise<boolean> {
	const m = normalizeImageMimeType(mime);
	if (m === 'image/png' || m === 'image/apng' || m === 'image/jpeg' || m === 'image/gif') {
		return true;
	}
	if (isSvgMimeType(m)) return false;
	if (m === 'application/json' || m === 'application/lottie+json') return false;
	const {hasNativeBridge} = await import('@app/features/messaging/utils/MediaNativeBridge');
	if (hasNativeBridge()) return true;
	const caps = await probeMediaCapabilities();
	if (m === 'image/webp') return caps.webp;
	if (m === 'image/avif') return caps.avif;
	if (m === 'image/jxl') return caps.jxl;
	if (m === 'image/heic' || m === 'image/heif') {
		return await canDecodeViaImage(`image/heic`);
	}
	return false;
}

async function canDecodeViaImage(mime: string): Promise<boolean> {
	if (typeof document === 'undefined' || typeof Image === 'undefined') return false;
	try {
		const blob = new Blob([new Uint8Array()], {type: mime});
		await createImageBitmap(blob);
		return true;
	} catch {
		return false;
	}
}

export function useCapabilityHint(): CapabilityResult | null {
	const subscribe = (cb: () => void): (() => void) => {
		listeners.add(cb);
		return () => {
			listeners.delete(cb);
		};
	};
	const getSnapshot = (): CapabilityResult | null => cached;
	const getServerSnapshot = (): CapabilityResult | null => null;
	const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
	const [bootstrapped, setBootstrapped] = useState(value);
	useEffect(() => {
		if (!bootstrapped) {
			void probeMediaCapabilities().then((r) => setBootstrapped(r));
		}
	}, [bootstrapped]);
	return value ?? bootstrapped;
}
