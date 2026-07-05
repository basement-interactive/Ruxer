// SPDX-License-Identifier: AGPL-3.0-or-later

import type {MediaViewerItem} from '@app/features/ui/state/MediaViewer';
import {MessageAttachmentFlags} from '@fluxer/constants/src/ChannelConstants';
import type {MessageAttachment} from '@fluxer/schema/src/domains/message/MessageResponseSchemas';

export function determineMediaType(attachment: MessageAttachment): 'audio' | 'video' | 'gifv' | 'gif' | 'image' {
	if (attachment.content_type?.startsWith('audio/')) {
		return 'audio';
	}
	if (attachment.content_type?.startsWith('video/') && (attachment.flags & MessageAttachmentFlags.IS_ANIMATED) !== 0) {
		return 'gifv';
	}
	if ((attachment.flags & MessageAttachmentFlags.IS_ANIMATED) !== 0 || attachment.content_type === 'image/gif') {
		return 'gif';
	}
	if (attachment.content_type?.startsWith('video/')) {
		return 'video';
	}
	return 'image';
}

export function attachmentToViewerItem(
	attachment: MessageAttachment,
	overrides?: Partial<MediaViewerItem>,
): MediaViewerItem {
	const type = determineMediaType(attachment);
	return {
		src: attachment.proxy_url ?? attachment.url ?? '',
		originalSrc: attachment.url ?? '',
		naturalWidth: attachment.width || 0,
		naturalHeight: attachment.height || 0,
		type,
		contentHash: attachment.content_hash,
		attachmentId: attachment.id,
		filename: attachment.filename,
		fileSize: attachment.size,
		contentType: attachment.content_type,
		duration: attachment.duration,
		expiresAt: attachment.expires_at ?? null,
		expired: attachment.expired ?? false,
		animated: type === 'gif' || type === 'gifv',
		...overrides,
	};
}

interface AttachmentsToViewerItemsOptions {
	filterType?: 'video';
	initialTimeForId?: {
		attachmentId: string;
		time: number;
	};
}

export function attachmentsToViewerItems(
	attachments: ReadonlyArray<MessageAttachment>,
	options?: AttachmentsToViewerItemsOptions,
): Array<MediaViewerItem> {
	const filtered = options?.filterType
		? attachments.filter((att) => att.content_type?.startsWith(`${options.filterType}/`))
		: attachments;
	return filtered.map((att) => {
		const initialTimeMatch = options?.initialTimeForId?.attachmentId === att.id;
		return attachmentToViewerItem(att, initialTimeMatch ? {initialTime: options!.initialTimeForId!.time} : undefined);
	});
}

export function findViewerItemIndex(items: ReadonlyArray<MediaViewerItem>, attachmentId?: string): number {
	return Math.max(
		0,
		items.findIndex((item) => item.attachmentId === attachmentId),
	);
}
