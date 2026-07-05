// SPDX-License-Identifier: AGPL-3.0-or-later

import type {Message} from '@app/features/messaging/models/MessagingMessage';
import type {MessageAttachment} from '@fluxer/schema/src/domains/message/MessageResponseSchemas';

const DEFAULT_CONTENT_TYPE = 'application/octet-stream';

export interface UploadingAttachmentDescriptor {
	readonly filename: string;
	readonly title?: string;
	readonly size: number;
	readonly contentType?: string;
}

export interface UploadingAttachmentFile {
	readonly name: string;
	readonly size: number;
	readonly type?: string;
}

export interface UploadingAttachmentListOptions {
	readonly formatMultipleFileLabel: (count: number) => string;
}

export interface ClaimedUploadingAttachment {
	readonly filename: string;
	readonly file: {
		readonly size: number;
	};
}

export class UploadingAttachment {
	private static readonly placeholderId = 'uploading';
	private readonly attachment: MessageAttachment;

	private constructor(descriptor: UploadingAttachmentDescriptor) {
		this.attachment = Object.freeze({
			id: UploadingAttachment.placeholderId,
			filename: descriptor.filename,
			title: descriptor.title,
			size: descriptor.size,
			url: null,
			proxy_url: null,
			content_type: descriptor.contentType || DEFAULT_CONTENT_TYPE,
			flags: 0,
		});
	}

	static fromDescriptor(descriptor: UploadingAttachmentDescriptor): UploadingAttachment {
		return new UploadingAttachment(descriptor);
	}

	static fromFiles(
		files: ReadonlyArray<UploadingAttachmentFile>,
		options: UploadingAttachmentListOptions,
	): UploadingAttachment | null {
		if (files.length === 0) {
			return null;
		}
		const first = files[0];
		return UploadingAttachment.fromDescriptor({
			filename: files.length === 1 ? first.name : options.formatMultipleFileLabel(files.length),
			title: files.length === 1 ? first.name : undefined,
			size: files.reduce((total, file) => total + file.size, 0),
			contentType: files.length === 1 ? first.type : DEFAULT_CONTENT_TYPE,
		});
	}

	static fromClaimedAttachments(
		attachments: ReadonlyArray<ClaimedUploadingAttachment>,
		options: UploadingAttachmentListOptions,
	): Array<MessageAttachment> {
		return (
			UploadingAttachment.fromFiles(
				attachments.map((attachment) => ({
					name: attachment.filename,
					size: attachment.file.size,
				})),
				options,
			)?.toArray() ?? []
		);
	}

	static is(attachment: MessageAttachment): boolean {
		return attachment.id === UploadingAttachment.placeholderId && !attachment.url && !attachment.proxy_url;
	}

	static isInSendingMessage(message: Message): boolean {
		return message.isSending && message.nonce === message.id && message.attachments.some(UploadingAttachment.is);
	}

	toJSON(): MessageAttachment {
		return {...this.attachment};
	}

	toArray(): Array<MessageAttachment> {
		return [this.toJSON()];
	}
}
