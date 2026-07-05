// SPDX-License-Identifier: AGPL-3.0-or-later

export const COMFY_MESSAGE_GROUP_SPACING_DEFAULT = 16;
export const COMPACT_MESSAGE_GROUP_SPACING_DEFAULT = 0;

export interface MessageGroupSpacingSettings {
	messageGroupSpacing: number;
	compactMessageGroupSpacing: number;
}

export interface MessageGroupSpacingPatch {
	messageGroupSpacing?: number;
	compactMessageGroupSpacing?: number;
}

export function getDefaultMessageGroupSpacing(messageDisplayCompact: boolean): number {
	return messageDisplayCompact ? COMPACT_MESSAGE_GROUP_SPACING_DEFAULT : COMFY_MESSAGE_GROUP_SPACING_DEFAULT;
}

export function getMessageGroupSpacingForDisplayMode(
	settings: MessageGroupSpacingSettings,
	messageDisplayCompact: boolean,
): number {
	return messageDisplayCompact ? settings.compactMessageGroupSpacing : settings.messageGroupSpacing;
}

export function getMessageGroupSpacingPatch(
	messageDisplayCompact: boolean,
	messageGroupSpacing: number,
): MessageGroupSpacingPatch {
	return messageDisplayCompact ? {compactMessageGroupSpacing: messageGroupSpacing} : {messageGroupSpacing};
}

export function migrateLegacyMessageGroupSpacing(
	legacyMessageGroupSpacing: number,
	messageDisplayCompact: boolean,
): MessageGroupSpacingSettings {
	const currentModeDefault = getDefaultMessageGroupSpacing(messageDisplayCompact);
	if (legacyMessageGroupSpacing === currentModeDefault) {
		return {
			messageGroupSpacing: COMFY_MESSAGE_GROUP_SPACING_DEFAULT,
			compactMessageGroupSpacing: COMPACT_MESSAGE_GROUP_SPACING_DEFAULT,
		};
	}
	return {
		messageGroupSpacing: legacyMessageGroupSpacing,
		compactMessageGroupSpacing: legacyMessageGroupSpacing,
	};
}
