// SPDX-License-Identifier: AGPL-3.0-or-later

import {splitMediaAndFileAttachments} from '@app/features/channel/components/MessageAttachmentUtils';
import DeveloperOptions from '@app/features/devtools/state/DeveloperOptions';
import {mapAttachmentsWithExpiry} from '@app/features/messaging/utils/AttachmentExpiryUtils';
import UserSettings from '@app/features/user/state/UserSettings';
import type {MessageAttachment} from '@fluxer/schema/src/domains/message/MessageResponseSchemas';

interface AttachmentRenderingState {
	enrichedAttachments: Array<MessageAttachment>;
	activeAttachments: Array<MessageAttachment>;
	mediaAttachments: Array<MessageAttachment>;
	shouldUseMosaic: boolean;
}

export const getAttachmentRenderingState = (
	snapshotAttachments?: ReadonlyArray<MessageAttachment> | null,
): AttachmentRenderingState => {
	const attachments = snapshotAttachments ?? [];
	const expiryApplied = mapAttachmentsWithExpiry(attachments, DeveloperOptions.mockAttachmentStates);
	const enrichedAttachments = expiryApplied.map((entry) => entry.attachment);
	const activeAttachments = expiryApplied.filter((entry) => !entry.isExpired).map((entry) => entry.attachment);
	const {mediaAttachments} = splitMediaAndFileAttachments(activeAttachments);
	const shouldUseMosaic = mediaAttachments.length > 0 && UserSettings.getInlineAttachmentMedia();
	return {
		enrichedAttachments,
		activeAttachments,
		mediaAttachments,
		shouldUseMosaic,
	};
};
