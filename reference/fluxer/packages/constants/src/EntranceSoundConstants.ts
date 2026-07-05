// SPDX-License-Identifier: AGPL-3.0-or-later

export const ENTRANCE_SOUND_MAX_PER_USER = 8;
export const ENTRANCE_SOUND_MAX_BYTES = 1024 * 1024;
export const ENTRANCE_SOUND_MAX_DURATION_MS = 5200;
export const ENTRANCE_SOUND_MIN_DURATION_MS = 100;
export const ENTRANCE_SOUND_NAME_MAX_LENGTH = 32;

export type EntranceSoundExtension = 'mp3' | 'ogg' | 'm4a' | 'wav';

export const ENTRANCE_SOUND_EXTENSIONS: ReadonlyArray<EntranceSoundExtension> = Object.freeze([
	'mp3',
	'ogg',
	'm4a',
	'wav',
]);

const ENTRANCE_SOUND_MIME_TO_EXT: Readonly<Record<string, EntranceSoundExtension>> = Object.freeze({
	'audio/mpeg': 'mp3',
	'audio/mp3': 'mp3',
	'audio/ogg': 'ogg',
	'audio/mp4': 'm4a',
	'audio/x-m4a': 'm4a',
	'audio/wav': 'wav',
	'audio/wave': 'wav',
	'audio/x-wav': 'wav',
});

export const ENTRANCE_SOUND_EXT_TO_MIME: Readonly<Record<EntranceSoundExtension, string>> = Object.freeze({
	mp3: 'audio/mpeg',
	ogg: 'audio/ogg',
	m4a: 'audio/mp4',
	wav: 'audio/wav',
});

function isEntranceSoundExtension(value: string): value is EntranceSoundExtension {
	return ENTRANCE_SOUND_EXTENSIONS.includes(value as EntranceSoundExtension);
}

export function entranceSoundExtensionFromMime(contentType: string | null | undefined): EntranceSoundExtension | null {
	if (!contentType) return null;
	const normalized = contentType.toLowerCase().split(';', 1)[0]?.trim() ?? '';
	return ENTRANCE_SOUND_MIME_TO_EXT[normalized] ?? null;
}

export function entranceSoundExtensionFromFormat(format: string | null | undefined): EntranceSoundExtension | null {
	if (!format) return null;
	const parts = format
		.toLowerCase()
		.split(',')
		.map((part) => part.trim())
		.filter((part) => part.length > 0);
	for (const normalized of parts.length > 0 ? parts : [format.toLowerCase().trim()]) {
		if (isEntranceSoundExtension(normalized)) return normalized;
		if (normalized === 'mpeg' || normalized === 'mp3' || normalized === 'mp2' || normalized === 'mp1') return 'mp3';
		if (normalized === 'ogg' || normalized === 'oga' || normalized === 'opus') return 'ogg';
		if (
			normalized === 'mp4' ||
			normalized === 'm4a' ||
			normalized === 'aac' ||
			normalized === 'mov' ||
			normalized === '3gp' ||
			normalized === '3g2'
		) {
			return 'm4a';
		}
		if (normalized === 'wav' || normalized === 'wave' || normalized === 'pcm_s16le' || normalized === 'pcm')
			return 'wav';
	}
	return null;
}

const ENTRANCE_SOUND_SCOPE_FIXED = Object.freeze(new Set<string>(['global', 'guilds', 'dms']));
const ENTRANCE_SOUND_GUILD_SCOPE_RE = /^guild:(\d{1,20})$/;

export function isValidEntranceSoundScopeId(scopeId: string): boolean {
	if (ENTRANCE_SOUND_SCOPE_FIXED.has(scopeId)) return true;
	return ENTRANCE_SOUND_GUILD_SCOPE_RE.test(scopeId);
}
