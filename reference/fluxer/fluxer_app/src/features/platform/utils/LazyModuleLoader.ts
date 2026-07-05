// SPDX-License-Identifier: AGPL-3.0-or-later

export const DEFAULT_LAZY_MODULE_LOAD_ATTEMPTS = 2;
export const DEFAULT_LAZY_MODULE_RETRY_DELAY_MS = 250;

export interface LazyModuleLoadOptions {
	attempts?: number;
	retryDelayMs?: number;
	shouldRetry?: (error: unknown) => boolean;
}

function errorText(error: unknown): string {
	if (error instanceof Error) {
		return `${error.name} ${error.message}`.toLowerCase();
	}
	return String(error).toLowerCase();
}

export function isLazyModuleLoadError(error: unknown): boolean {
	const text = errorText(error);
	return (
		text.includes('chunkloaderror') ||
		text.includes('loading chunk') ||
		text.includes('loading css chunk') ||
		text.includes('failed to fetch dynamically imported module') ||
		text.includes('error loading dynamically imported module') ||
		text.includes('importing a module script failed')
	);
}

function resolveAttemptCount(attempts?: number): number {
	if (attempts === undefined) {
		return DEFAULT_LAZY_MODULE_LOAD_ATTEMPTS;
	}
	return Math.max(1, Math.floor(attempts));
}

function waitForRetryDelay(delayMs: number): Promise<void> {
	if (delayMs <= 0) {
		return Promise.resolve();
	}
	return new Promise((resolve) => {
		setTimeout(resolve, delayMs);
	});
}

export async function loadLazyModule<Module>(
	load: () => Promise<Module>,
	options: LazyModuleLoadOptions = {},
): Promise<Module> {
	const attempts = resolveAttemptCount(options.attempts);
	const retryDelayMs = options.retryDelayMs ?? DEFAULT_LAZY_MODULE_RETRY_DELAY_MS;
	const shouldRetry = options.shouldRetry ?? isLazyModuleLoadError;

	for (let attempt = 1; attempt <= attempts; attempt += 1) {
		try {
			return await load();
		} catch (error) {
			if (attempt >= attempts || !shouldRetry(error)) {
				throw error;
			}
			await waitForRetryDelay(retryDelayMs);
		}
	}

	throw new Error('Lazy module loader exhausted without a result');
}
