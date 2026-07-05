// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	ENTRANCE_SOUND_EXTENSIONS,
	ENTRANCE_SOUND_MAX_BYTES,
	ENTRANCE_SOUND_MAX_DURATION_MS,
	ENTRANCE_SOUND_NAME_MAX_LENGTH,
} from '@fluxer/constants/src/EntranceSoundConstants';
import {createBase64StringType} from '@fluxer/schema/src/primitives/FileValidators';
import {createStringType, SnowflakeType} from '@fluxer/schema/src/primitives/SchemaPrimitives';
import {z} from 'zod';

const ScopeIdSchema = z
	.string()
	.min(1)
	.max(32)
	.regex(/^(global|guilds|dms|guild:\d{1,20})$/, 'Invalid scope identifier')
	.describe('Entrance sound scope identifier');

const ENTRANCE_SOUND_BASE64_MAX_CHARS = Math.ceil((ENTRANCE_SOUND_MAX_BYTES * 4) / 3) + 32;

function toNonEmptyStringTuple<TValue extends string>(values: ReadonlyArray<TValue>): [TValue, ...Array<TValue>] {
	const [first, ...rest] = values;
	if (first === undefined) {
		throw new Error('Expected at least one enum value');
	}
	return [first, ...rest];
}

const EntranceSoundExtensionValues = toNonEmptyStringTuple(ENTRANCE_SOUND_EXTENSIONS);

export const EntranceSoundUploadRequest = z.object({
	name: createStringType(1, ENTRANCE_SOUND_NAME_MAX_LENGTH).describe('Display label for the sound'),
	audio: createBase64StringType(1, ENTRANCE_SOUND_BASE64_MAX_CHARS).describe('Base64-encoded audio bytes'),
});

export type EntranceSoundUploadRequest = z.infer<typeof EntranceSoundUploadRequest>;

export const EntranceSoundRenameRequest = z.object({
	name: createStringType(1, ENTRANCE_SOUND_NAME_MAX_LENGTH),
});

export type EntranceSoundRenameRequest = z.infer<typeof EntranceSoundRenameRequest>;

export const EntranceSoundSelectionRequest = z.object({
	scope_id: ScopeIdSchema,
	sound_id: SnowflakeType.nullable().describe('Sound ID to assign, or null to clear'),
});

export type EntranceSoundSelectionRequest = z.infer<typeof EntranceSoundSelectionRequest>;

export const EntranceSoundResponse = z.object({
	id: SnowflakeType,
	name: z.string(),
	hash: z.string(),
	extension: z.enum(EntranceSoundExtensionValues),
	content_type: z.string(),
	duration_ms: z.number().int().min(0).max(ENTRANCE_SOUND_MAX_DURATION_MS),
	size_bytes: z.number().int().min(0).max(ENTRANCE_SOUND_MAX_BYTES),
	url: z.string().url(),
	created_at: z.string().datetime(),
});

export type EntranceSoundResponse = z.infer<typeof EntranceSoundResponse>;

const EntranceSoundSelectionResponse = z.object({
	scope_id: ScopeIdSchema,
	sound_id: SnowflakeType,
});

export const EntranceSoundLibraryResponse = z.object({
	sounds: z.array(EntranceSoundResponse),
	selections: z.array(EntranceSoundSelectionResponse),
});

export type EntranceSoundLibraryResponse = z.infer<typeof EntranceSoundLibraryResponse>;

export const EntranceSoundPlayRequest = z.object({
	sound_id: SnowflakeType,
});

export type EntranceSoundPlayRequest = z.infer<typeof EntranceSoundPlayRequest>;

export const EntranceSoundIdParam = z.object({
	sound_id: SnowflakeType,
});

export type EntranceSoundIdParam = z.infer<typeof EntranceSoundIdParam>;
