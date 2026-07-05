// SPDX-License-Identifier: AGPL-3.0-or-later

import {AdminMessageSchema} from '@fluxer/schema/src/domains/admin/AdminSchemas';
import {MessageResponseSchema} from '@fluxer/schema/src/domains/message/MessageResponseSchemas';
import {SnowflakeType} from '@fluxer/schema/src/primitives/SchemaPrimitives';
import {z} from 'zod';

export const BrowseChannelRequest = z.object({
	channel_id: SnowflakeType,
	before: SnowflakeType.optional(),
	after: SnowflakeType.optional(),
	limit: z.number().int().min(1).max(100).default(50),
});

export type BrowseChannelRequest = z.infer<typeof BrowseChannelRequest>;

export const BrowseChannelResponse = z.object({
	messages: z.array(AdminMessageSchema).max(100),
	message_responses: z.array(MessageResponseSchema).max(100).optional(),
	has_more: z.boolean(),
});

export type BrowseChannelResponse = z.infer<typeof BrowseChannelResponse>;

export const SearchChannelMessagesRequest = z.object({
	channel_id: SnowflakeType,
	query: z.string().min(1).max(200),
	limit: z.number().int().min(1).max(100).default(25),
});

export type SearchChannelMessagesRequest = z.infer<typeof SearchChannelMessagesRequest>;

export const SearchChannelMessagesResponse = z.object({
	messages: z.array(AdminMessageSchema).max(100),
	message_responses: z.array(MessageResponseSchema).max(100).optional(),
	total: z.number().int().min(0),
});

export type SearchChannelMessagesResponse = z.infer<typeof SearchChannelMessagesResponse>;
