// SPDX-License-Identifier: AGPL-3.0-or-later

import type {GifMediaFormat} from '@fluxer/schema/src/domains/gif/GifSchemas';
import * as SnowflakeUtils from '@fluxer/snowflake/src/SnowflakeUtils';

export type FavoriteMemeWire = Readonly<{
	id: string;
	user_id: string;
	name: string;
	alt_text: string | null;
	tags: Array<string>;
	attachment_id: string;
	filename: string;
	content_type: string;
	content_hash: string | null;
	size: number;
	width: number | null;
	height: number | null;
	duration: number | null;
	is_gifv: boolean;
	url: string;
	gif_slug: string | null;
	gif_provider: string | null;
	media: Record<string, GifMediaFormat> | null;
	placeholder: string | null;
}>;

export class FavoriteMeme {
	readonly id: string;
	readonly userId: string;
	readonly name: string;
	readonly altText: string | null;
	readonly tags: Array<string>;
	readonly attachmentId: string;
	readonly filename: string;
	readonly contentType: string;
	readonly contentHash: string | null;
	readonly size: number;
	readonly width: number | null;
	readonly height: number | null;
	readonly duration: number | null;
	readonly isGifv: boolean;
	readonly url: string;
	readonly gifSlug: string | null;
	readonly gifProvider: string | null;
	readonly media: Record<string, GifMediaFormat> | null;
	readonly placeholder: string | null;

	constructor(meme: FavoriteMemeWire) {
		this.id = meme.id;
		this.userId = meme.user_id;
		this.name = meme.name;
		this.altText = meme.alt_text;
		this.tags = meme.tags;
		this.attachmentId = meme.attachment_id;
		this.filename = meme.filename;
		this.contentType = meme.content_type;
		this.contentHash = meme.content_hash;
		this.size = meme.size;
		this.width = meme.width;
		this.height = meme.height;
		this.duration = meme.duration;
		this.isGifv = meme.is_gifv;
		this.url = meme.url;
		this.gifSlug = meme.gif_slug;
		this.gifProvider = meme.gif_provider;
		this.media = meme.media;
		this.placeholder = meme.placeholder ?? null;
	}

	get createdAtTimestamp(): number {
		return SnowflakeUtils.extractTimestamp(this.id);
	}

	get createdAt(): Date {
		return new Date(this.createdAtTimestamp);
	}

	isImage(): boolean {
		return this.contentType.startsWith('image/');
	}

	isVideo(): boolean {
		return this.contentType.startsWith('video/');
	}

	isAudio(): boolean {
		return this.contentType.startsWith('audio/');
	}

	getMediaType(): 'image' | 'gifv' | 'video' | 'audio' | 'unknown' {
		if (this.isGifv) return 'gifv';
		if (this.isImage()) return 'image';
		if (this.isVideo()) return 'video';
		if (this.isAudio()) return 'audio';
		return 'unknown';
	}

	equals(other: FavoriteMeme): boolean {
		return (
			this.id === other.id &&
			this.userId === other.userId &&
			this.name === other.name &&
			this.altText === other.altText &&
			JSON.stringify(this.tags) === JSON.stringify(other.tags) &&
			this.attachmentId === other.attachmentId &&
			this.filename === other.filename &&
			this.contentType === other.contentType &&
			this.contentHash === other.contentHash &&
			this.size === other.size &&
			this.width === other.width &&
			this.height === other.height &&
			this.duration === other.duration &&
			this.isGifv === other.isGifv &&
			this.url === other.url &&
			this.gifSlug === other.gifSlug &&
			this.gifProvider === other.gifProvider &&
			JSON.stringify(this.media) === JSON.stringify(other.media) &&
			this.placeholder === other.placeholder
		);
	}

	toJSON(): FavoriteMemeWire {
		return {
			id: this.id,
			user_id: this.userId,
			name: this.name,
			alt_text: this.altText,
			tags: this.tags,
			attachment_id: this.attachmentId,
			filename: this.filename,
			content_type: this.contentType,
			content_hash: this.contentHash,
			size: this.size,
			width: this.width,
			height: this.height,
			duration: this.duration,
			is_gifv: this.isGifv,
			url: this.url,
			gif_slug: this.gifSlug,
			gif_provider: this.gifProvider,
			media: this.media,
			placeholder: this.placeholder,
		};
	}
}
