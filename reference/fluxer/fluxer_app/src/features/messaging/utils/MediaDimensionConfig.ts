// SPDX-License-Identifier: AGPL-3.0-or-later

import Accessibility, {MediaDimensionSize} from '@app/features/accessibility/state/Accessibility';
import type {Message} from '@app/features/messaging/models/MessagingMessage';
import type {MediaDimensions} from '@app/lib/branded-types';
import {MessageFlags} from '@fluxer/constants/src/ChannelConstants';

interface MediaDimensionConstraints extends MediaDimensions {}

const DIMENSION_PRESETS = {
	SMALL: {
		maxWidth: 400,
		maxHeight: 300,
	},
	LARGE: {
		maxWidth: 550,
		maxHeight: 400,
	},
} as const;

export function getAttachmentMediaDimensions(message?: Message): MediaDimensionConstraints {
	if (message && (message.flags & MessageFlags.COMPACT_ATTACHMENTS) !== 0) {
		return DIMENSION_PRESETS.SMALL;
	}
	const size = Accessibility.attachmentMediaDimensionSize;
	return size === MediaDimensionSize.SMALL ? DIMENSION_PRESETS.SMALL : DIMENSION_PRESETS.LARGE;
}

export function getEmbedMediaDimensions(): MediaDimensionConstraints {
	const size = Accessibility.embedMediaDimensionSize;
	return size === MediaDimensionSize.SMALL ? DIMENSION_PRESETS.SMALL : DIMENSION_PRESETS.LARGE;
}

export function getMosaicMediaDimensions(message?: Message): MediaDimensionConstraints {
	return getAttachmentMediaDimensions(message);
}
