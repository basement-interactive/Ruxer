// SPDX-License-Identifier: AGPL-3.0-or-later

import {MessageFlags, MessageFlagsDescriptions} from '@fluxer/constants/src/ChannelConstants';
import {MessageEmbedResponse} from '@fluxer/schema/src/domains/message/EmbedSchemas';
import {MessageNonceRequest, MessageRequestSchema} from '@fluxer/schema/src/domains/message/MessageRequestSchemas';
import {
	MessageAttachmentResponse,
	MessageStickerResponse,
} from '@fluxer/schema/src/domains/message/MessageResponseSchemas';
import {
	AllowedMentionParseTypeSchema,
	MessageReferenceTypeSchema,
} from '@fluxer/schema/src/primitives/MessageValidators';
import {
	createBitflagInt32Type,
	createNamedStringLiteralUnion,
	createStringType,
	SnowflakeStringType,
	withFieldDescription,
	withOpenApiType,
} from '@fluxer/schema/src/primitives/SchemaPrimitives';
import {z} from 'zod';

export const ScheduledMessageRequestSchema = MessageRequestSchema.extend({
	scheduled_local_at: createStringType(1, 64).describe(
		'ISO 8601 timestamp expressed in the user local timezone for when the message should be delivered',
	),
	timezone: createStringType(1, 128).describe('IANA timezone identifier the schedule_local_at value is anchored to'),
});

export type ScheduledMessageRequestSchema = z.infer<typeof ScheduledMessageRequestSchema>;

const ScheduledMessageAllowedMentionsSchema = z.object({
	parse: z.array(AllowedMentionParseTypeSchema).optional().describe('Types of mentions to parse from content'),
	users: z.array(SnowflakeStringType).optional().describe('Array of user IDs to mention'),
	roles: z.array(SnowflakeStringType).optional().describe('Array of role IDs to mention'),
	replied_user: z.boolean().optional().describe('Whether to mention the author of the replied message'),
});

const ScheduledMessageReferenceSchema = z.object({
	message_id: SnowflakeStringType.describe('ID of the message being referenced'),
	channel_id: SnowflakeStringType.optional().describe('ID of the channel containing the referenced message'),
	guild_id: SnowflakeStringType.optional().describe('ID of the guild containing the referenced message'),
	type: withFieldDescription(MessageReferenceTypeSchema, 'The type of message reference').optional(),
});

const ScheduledMessagePayloadResponseSchema = z.object({
	content: z.string().nullish().describe('The text content of the scheduled message'),
	tts: z.boolean().optional().describe('Whether this is a text-to-speech message'),
	embeds: z.array(MessageEmbedResponse).optional().describe('Array of embed objects attached to the message'),
	attachments: z.array(MessageAttachmentResponse).optional().describe('Array of attachment objects for the message'),
	stickers: z.array(MessageStickerResponse).optional().describe('Array of sticker objects attached to the message'),
	sticker_ids: z.array(SnowflakeStringType).optional().describe('Array of sticker IDs to include in the message'),
	allowed_mentions: ScheduledMessageAllowedMentionsSchema.optional().describe(
		'Controls which mentions trigger notifications',
	),
	message_reference: ScheduledMessageReferenceSchema.optional().describe(
		'Reference to another message (for replies or forwards)',
	),
	flags: createBitflagInt32Type(MessageFlags, MessageFlagsDescriptions, 'Message flags', 'MessageFlags').optional(),
	nonce: MessageNonceRequest.optional(),
	favorite_meme_id: SnowflakeStringType.optional().describe('ID of a favorite meme to attach'),
});

const ScheduledMessageStatus = withOpenApiType(
	createNamedStringLiteralUnion(
		[
			['pending', 'pending', 'The message is pending validation and has not yet been scheduled'],
			['invalid', 'invalid', 'The message failed validation and cannot be sent'],
			['scheduled', 'scheduled', 'The message has been validated and is scheduled for delivery'],
			['sent', 'sent', 'The message has been successfully sent'],
			['failed', 'failed', 'The message failed to send after being scheduled'],
			['cancelled', 'cancelled', 'The scheduled message was cancelled by the user'],
		],
		'The current status of the scheduled message',
	),
	'ScheduledMessageStatus',
);

export const ScheduledMessageResponseSchema = z.object({
	id: SnowflakeStringType.describe('The unique identifier for this scheduled message'),
	channel_id: SnowflakeStringType.describe('The ID of the channel this message will be sent to'),
	scheduled_at: z.string().describe('The ISO 8601 UTC timestamp when the message is scheduled to be sent'),
	scheduled_local_at: z.string().describe('The ISO 8601 timestamp in the user local timezone'),
	timezone: z.string().describe('The IANA timezone identifier used for scheduling'),
	status: ScheduledMessageStatus.describe('The current status of the scheduled message'),
	status_reason: z.string().nullable().describe('A human-readable reason for the current status, if applicable'),
	payload: ScheduledMessagePayloadResponseSchema.describe('The message content and metadata to be sent'),
	created_at: z.string().describe('The ISO 8601 timestamp when this scheduled message was created'),
	invalidated_at: z.string().nullable().describe('The ISO 8601 timestamp when the message was marked invalid'),
});

export type ScheduledMessageResponseSchema = z.infer<typeof ScheduledMessageResponseSchema>;
