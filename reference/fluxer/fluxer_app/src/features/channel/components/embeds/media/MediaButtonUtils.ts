// SPDX-License-Identifier: AGPL-3.0-or-later

import Accessibility from '@app/features/accessibility/state/Accessibility';
import {canDeleteAttachmentUtil} from '@app/features/channel/components/MessageActionUtils';
import type {Message} from '@app/features/messaging/models/MessagingMessage';

export interface MediaButtonVisibilityOptions {
	disableDelete?: boolean;
}

export interface MediaButtonVisibility {
	showFavoriteButton: boolean;
	showDownloadButton: boolean;
	showDeleteButton: boolean;
}

export function getMediaButtonVisibility(
	canFavorite: boolean,
	message?: Message,
	attachmentId?: string,
	options?: MediaButtonVisibilityOptions,
): MediaButtonVisibility {
	const showMediaFavoriteButton = Accessibility.showMediaFavoriteButton;
	const showMediaDownloadButton = Accessibility.showMediaDownloadButton;
	const showMediaDeleteButton = Accessibility.showMediaDeleteButton;
	const disableDelete = options?.disableDelete ?? false;
	return {
		showFavoriteButton: showMediaFavoriteButton && canFavorite,
		showDownloadButton: showMediaDownloadButton,
		showDeleteButton:
			showMediaDeleteButton && !disableDelete && !!(message && attachmentId && canDeleteAttachmentUtil(message)),
	};
}
