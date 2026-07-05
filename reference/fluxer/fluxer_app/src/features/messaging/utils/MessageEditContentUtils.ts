// SPDX-License-Identifier: AGPL-3.0-or-later

import type {ApiMessageEditAttachmentMetadata} from '@app/features/messaging/utils/MessageRequestUtils';

interface MessageWithAttachments {
	attachments: ReadonlyArray<{id: string}>;
}

export function canSubmitEmptyMessageEdit(message: MessageWithAttachments): boolean {
	return message.attachments.length > 0;
}

export function buildExistingAttachmentEditReferences(
	message: MessageWithAttachments,
): Array<ApiMessageEditAttachmentMetadata> {
	return message.attachments.map((attachment) => ({id: attachment.id}));
}
