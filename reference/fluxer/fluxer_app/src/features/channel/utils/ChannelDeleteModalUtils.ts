// SPDX-License-Identifier: AGPL-3.0-or-later

import * as ChannelCommands from '@app/features/channel/commands/ChannelCommands';
import type {Channel} from '@app/features/channel/models/Channel';
import Channels from '@app/features/channel/state/Channels';
import {
	CATEGORY_DELETED_DESCRIPTOR,
	DELETE_CATEGORY_DESCRIPTOR,
	DELETE_CHANNEL_DESCRIPTOR,
} from '@app/features/channel/utils/ChannelMessageDescriptors';
import {CHANNEL_DELETED_DESCRIPTOR} from '@app/features/i18n/utils/CommonMessageDescriptors';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import * as ToastCommands from '@app/features/ui/commands/ToastCommands';
import {ChannelTypes} from '@fluxer/constants/src/ChannelConstants';
import type {I18n, MessageDescriptor} from '@lingui/core';

export interface ChannelDeleteModalProps {
	channelId: string;
}

export interface ChannelDeleteInfo {
	channel: Channel;
	isCategory: boolean;
	title: MessageDescriptor;
	confirmText: MessageDescriptor;
	successMessage: MessageDescriptor;
}

export async function deleteChannel(channelId: string, i18n: I18n): Promise<void> {
	const channel = Channels.getChannel(channelId);
	if (!channel) return;
	await ChannelCommands.remove(channelId);
	ModalCommands.popAll();
	const successMessage =
		channel.type === ChannelTypes.GUILD_CATEGORY ? CATEGORY_DELETED_DESCRIPTOR : CHANNEL_DELETED_DESCRIPTOR;
	ToastCommands.createToast({
		type: 'success',
		children: i18n._(successMessage),
	});
}

export function getChannelDeleteInfo(channelId: string): ChannelDeleteInfo | null {
	const channel = Channels.getChannel(channelId);
	if (!channel) return null;
	const isCategory = channel.type === ChannelTypes.GUILD_CATEGORY;
	const title = isCategory ? DELETE_CATEGORY_DESCRIPTOR : DELETE_CHANNEL_DESCRIPTOR;
	const confirmText = isCategory ? DELETE_CATEGORY_DESCRIPTOR : DELETE_CHANNEL_DESCRIPTOR;
	const successMessage = isCategory ? CATEGORY_DELETED_DESCRIPTOR : CHANNEL_DELETED_DESCRIPTOR;
	return {
		channel,
		isCategory,
		title,
		confirmText,
		successMessage,
	};
}
