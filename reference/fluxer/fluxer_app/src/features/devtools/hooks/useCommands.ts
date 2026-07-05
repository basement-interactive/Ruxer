// SPDX-License-Identifier: AGPL-3.0-or-later

import {Permissions} from '@fluxer/constants/src/ChannelConstants';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {useMemo} from 'react';

const APPENDS_TO_YOUR_MESSAGE_DESCRIPTOR = msg({
	message: 'Appends ¯\\_(ツ)_/¯ to your message.',
	comment: "Slash-command description for /shrug. Appends a kaomoji to the user's message.",
});
const APPENDS_TO_YOUR_MESSAGE_2_DESCRIPTOR = msg({
	message: 'Appends (╯°□°)╯︵ ┻━┻ to your message.',
	comment: "Slash-command description for /tableflip. Appends a kaomoji to the user's message.",
});
const APPENDS_TO_YOUR_MESSAGE_3_DESCRIPTOR = msg({
	message: 'Appends ┬─┬ ノ( ゜-゜ノ) to your message.',
	comment: "Slash-command description for /unflip. Appends a kaomoji to the user's message.",
});
const SEND_AN_ACTION_MESSAGE_WRAPS_IN_ITALICS_DESCRIPTOR = msg({
	message: 'Send an action message (wraps in italics).',
	comment: 'Slash-command description for /me. Sends the message wrapped in italics, IRC-style.',
});
const SEND_A_SPOILER_MESSAGE_WRAPS_IN_SPOILER_TAGS_DESCRIPTOR = msg({
	message: 'Send a spoiler message (wraps in spoiler tags).',
	comment:
		'Slash-command description for /spoiler. Wraps the message in spoiler tags so recipients must click to reveal.',
});
const SEND_A_TEXT_TO_SPEECH_MESSAGE_DESCRIPTOR = msg({
	message: 'Send a text-to-speech message.',
	comment:
		'Slash-command description for /tts. Sends a text-to-speech message played aloud for users with TTS enabled.',
});
const CHANGE_YOUR_NICKNAME_IN_THIS_COMMUNITY_DESCRIPTOR = msg({
	message: 'Change your nickname in this community.',
	comment: "Slash-command description for /nick. Changes the user's nickname in the current community.",
});
const KICK_A_MEMBER_FROM_THIS_COMMUNITY_DESCRIPTOR = msg({
	message: 'Kick a member from this community.',
	comment: 'Slash-command description for /kick. Removes a member from the current community (moderation action).',
});
const BAN_A_MEMBER_FROM_THIS_COMMUNITY_DESCRIPTOR = msg({
	message: 'Ban a member from this community.',
	comment: 'Slash-command description for /ban. Bans a member from the current community (moderation action).',
});
const SEND_A_DIRECT_MESSAGE_TO_A_USER_DESCRIPTOR = msg({
	message: 'Send a direct message to a user.',
	comment: 'Slash-command description for /dm. Sends a direct message to a user.',
});
const SEND_A_SAVED_MEDIA_ITEM_DESCRIPTOR = msg({
	message: 'Send a saved media item.',
	comment: 'Slash-command description for /favorites. Sends a saved / favorited media item.',
});
const SEND_A_STICKER_DESCRIPTOR = msg({
	message: 'Send a sticker.',
	comment: 'Slash-command description for /sticker. Sends a sticker.',
});
const SEARCH_FOR_AND_SEND_A_GIF_DESCRIPTOR = msg({
	message: 'Search for and send a GIF.',
	comment: 'Slash-command description for /gif. Searches for and sends a GIF.',
});

interface SimpleCommand {
	type: 'simple';
	name: string;
	content: string;
	description: string;
}

interface ActionCommand {
	type: 'action';
	name: string;
	description: string;
	permission?: bigint;
	requiresGuild?: boolean;
}

export type Command = SimpleCommand | ActionCommand;

export function useCommands(): Array<Command> {
	const {i18n} = useLingui();
	return useMemo(
		(): Array<Command> => [
			{type: 'simple', name: '/shrug', content: '¯\\_(ツ)_/¯', description: i18n._(APPENDS_TO_YOUR_MESSAGE_DESCRIPTOR)},
			{
				type: 'simple',
				name: '/tableflip',
				content: '(╯°□°)╯︵ ┻━┻',
				description: i18n._(APPENDS_TO_YOUR_MESSAGE_2_DESCRIPTOR),
			},
			{
				type: 'simple',
				name: '/unflip',
				content: '┬─┬ ノ( ゜-゜ノ)',
				description: i18n._(APPENDS_TO_YOUR_MESSAGE_3_DESCRIPTOR),
			},
			{type: 'action', name: '/me', description: i18n._(SEND_AN_ACTION_MESSAGE_WRAPS_IN_ITALICS_DESCRIPTOR)},
			{type: 'action', name: '/spoiler', description: i18n._(SEND_A_SPOILER_MESSAGE_WRAPS_IN_SPOILER_TAGS_DESCRIPTOR)},
			{
				type: 'action',
				name: '/tts',
				description: i18n._(SEND_A_TEXT_TO_SPEECH_MESSAGE_DESCRIPTOR),
				permission: Permissions.SEND_TTS_MESSAGES,
			},
			{
				type: 'action',
				name: '/nick',
				description: i18n._(CHANGE_YOUR_NICKNAME_IN_THIS_COMMUNITY_DESCRIPTOR),
				permission: Permissions.CHANGE_NICKNAME,
				requiresGuild: true,
			},
			{
				type: 'action',
				name: '/kick',
				description: i18n._(KICK_A_MEMBER_FROM_THIS_COMMUNITY_DESCRIPTOR),
				permission: Permissions.KICK_MEMBERS,
				requiresGuild: true,
			},
			{
				type: 'action',
				name: '/ban',
				description: i18n._(BAN_A_MEMBER_FROM_THIS_COMMUNITY_DESCRIPTOR),
				permission: Permissions.BAN_MEMBERS,
				requiresGuild: true,
			},
			{type: 'action', name: '/msg', description: i18n._(SEND_A_DIRECT_MESSAGE_TO_A_USER_DESCRIPTOR)},
			{type: 'action', name: '/saved', description: i18n._(SEND_A_SAVED_MEDIA_ITEM_DESCRIPTOR)},
			{type: 'action', name: '/sticker', description: i18n._(SEND_A_STICKER_DESCRIPTOR)},
			{type: 'action', name: '/gif', description: i18n._(SEARCH_FOR_AND_SEND_A_GIF_DESCRIPTOR)},
		],
		[i18n.locale],
	);
}
