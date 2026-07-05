// SPDX-License-Identifier: AGPL-3.0-or-later

import {GifMediaFormat} from '@fluxer/schema/src/domains/gif/GifSchemas';
import {z} from 'zod';

export const ResolveGifUrlsBodySchema = z.object({
	urls: z.array(z.url()).min(1).max(200).describe('GIF URLs to resolve into entries with proxy metadata'),
});

export type ResolveGifUrlsBodySchema = z.infer<typeof ResolveGifUrlsBodySchema>;

export const ResolvedGifEntrySchema = z.object({
	url: z.string().describe('Original GIF URL'),
	proxy_url: z.string().describe('Signed media proxy URL for the GIF'),
	width: z.number().int().describe('Width of the GIF in pixels (0 if unknown)'),
	height: z.number().int().describe('Height of the GIF in pixels (0 if unknown)'),
	media: z
		.record(z.string(), GifMediaFormat)
		.default({})
		.describe(
			'Provider-issued format-name → media descriptor map (mirrors GifResponse.media). Empty when the URL is not recognizable as belonging to any registered GIF provider.',
		),
	content_type: z
		.string()
		.default('')
		.describe(
			'MIME type of the primary media (top-level url). Empty string means "unknown / image/gif" — clients should treat it as image/gif for backward compat.',
		),
	placeholder: z
		.string()
		.nullish()
		.describe(
			'Compact thumbhash placeholder produced by the media proxy. Persisted with the favorite so the picker can show a low-res preview while the GIF loads, and a fallback if the source URL later disappears.',
		),
});

export type ResolvedGifEntrySchema = z.infer<typeof ResolvedGifEntrySchema>;

export const ResolveGifUrlsResponse = z.object({
	entries: z.array(ResolvedGifEntrySchema).describe('Resolved GIF entries with proxy metadata'),
});

export type ResolveGifUrlsResponse = z.infer<typeof ResolveGifUrlsResponse>;
