// SPDX-License-Identifier: AGPL-3.0-or-later

import {getConfig} from '@fluxer/config/src/ConfigLoader';

type ReleaseChannel = 'stable' | 'canary';

interface BuildMetadata {
	buildVersion: string;
	releaseChannel: ReleaseChannel;
}

const FALLBACK_VALUES = {
	BUILD_VERSION: 'dev',
	RELEASE_CHANNEL: 'stable',
} as const;

let fallbackLogged = false;

function isDevEnvironment(): boolean {
	try {
		const config = getConfig();
		return config.env === 'development' || config.env === 'test';
	} catch {
		return false;
	}
}

function logFallbackWarning(usedFallbacks: Array<string>): void {
	if (fallbackLogged || usedFallbacks.length === 0 || isDevEnvironment()) {
		return;
	}
	fallbackLogged = true;
	process.stdout.write(
		`[build-metadata] Using fallback values for: ${usedFallbacks.join(', ')}. ` +
			`This indicates missing env vars in CI/production.\n`,
	);
}

function getEnvOrDefault(name: string, defaultValue: string, usedFallbacks: Array<string>): string {
	const value = process.env[name];
	if (value !== undefined && value.trim() !== '') {
		return value.trim();
	}
	usedFallbacks.push(name);
	return defaultValue;
}

function resolveReleaseChannel(usedFallbacks: Array<string>): ReleaseChannel {
	const raw = getEnvOrDefault('RELEASE_CHANNEL', FALLBACK_VALUES.RELEASE_CHANNEL, usedFallbacks).toLowerCase();
	switch (raw) {
		case 'canary':
			return 'canary';
		default:
			return 'stable';
	}
}

let cachedMetadata: BuildMetadata | null = null;

export function getBuildMetadata(): BuildMetadata {
	if (cachedMetadata === null) {
		const usedFallbacks: Array<string> = [];
		cachedMetadata = {
			buildVersion: getEnvOrDefault('BUILD_VERSION', FALLBACK_VALUES.BUILD_VERSION, usedFallbacks),
			releaseChannel: resolveReleaseChannel(usedFallbacks),
		};
		logFallbackWarning(usedFallbacks);
	}
	return cachedMetadata;
}
