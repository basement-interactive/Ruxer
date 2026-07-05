// SPDX-License-Identifier: AGPL-3.0-or-later

import {JoinSourceTypeSchema} from '@fluxer/schema/src/primitives/GuildValidators';
import {z} from 'zod';

export const GuildMemberSearchRequest = z.object({
	query: z.string().max(100).optional().describe('Text to search for in usernames, global names, and nicknames'),
	limit: z.number().int().min(1).max(100).default(25).describe('Maximum number of results to return'),
	offset: z.number().int().min(0).default(0).describe('Number of results to skip for pagination'),
	role_ids: z
		.array(z.string())
		.max(10)
		.optional()
		.describe('Filter by role IDs (member must have all specified roles)'),
	joined_at_gte: z.number().int().optional().describe('Filter members who joined at or after this unix timestamp'),
	joined_at_lte: z.number().int().optional().describe('Filter members who joined at or before this unix timestamp'),
	join_source_type: z.array(JoinSourceTypeSchema).max(10).optional().describe('Filter by join source types'),
	source_invite_code: z.array(z.string()).max(10).optional().describe('Filter by invite codes used to join'),
	is_bot: z.boolean().optional().describe('Filter by bot status'),
	user_created_at_gte: z
		.number()
		.int()
		.optional()
		.describe('Filter members whose account was created at or after this unix timestamp'),
	user_created_at_lte: z
		.number()
		.int()
		.optional()
		.describe('Filter members whose account was created at or before this unix timestamp'),
	sort_by: z.enum(['joinedAt', 'relevance']).optional().describe('Sort results by field'),
	sort_order: z.enum(['asc', 'desc']).optional().describe('Sort order'),
});

export type GuildMemberSearchRequest = z.infer<typeof GuildMemberSearchRequest>;

const GuildMemberSearchSupplemental = z.object({
	join_source_type: JoinSourceTypeSchema.nullish().describe('How the member joined'),
	source_invite_code: z.string().nullable().describe('Invite code used to join'),
	inviter_id: z.string().nullable().describe('User ID of the member who sent the invite'),
});

export const GuildMemberSearchResult = z.object({
	id: z.string().describe('Composite ID (guildId:userId)'),
	guild_id: z.string().describe('Guild ID'),
	user_id: z.string().describe('User ID'),
	username: z.string().describe('Username'),
	discriminator: z.string().describe('Zero-padded 4-digit discriminator'),
	global_name: z.string().nullable().describe('Global display name'),
	nickname: z.string().nullable().describe('Guild nickname'),
	role_ids: z.array(z.string()).describe('Role IDs'),
	joined_at: z.number().describe('Unix timestamp of when the member joined'),
	supplemental: GuildMemberSearchSupplemental.describe(
		'Supplemental members-search-only metadata that is not part of the base guild member payload',
	),
	is_bot: z.boolean().describe('Whether the user is a bot'),
});

export type GuildMemberSearchResult = z.infer<typeof GuildMemberSearchResult>;

export const GuildMemberSearchResponse = z.object({
	guild_id: z.string().describe('Guild ID'),
	members: z.array(GuildMemberSearchResult).describe('Matching members'),
	page_result_count: z.number().int().describe('Number of results in this page'),
	total_result_count: z.number().int().describe('Total number of matching results'),
	indexing: z.boolean().describe('Whether the guild members are currently being indexed'),
});

export type GuildMemberSearchResponse = z.infer<typeof GuildMemberSearchResponse>;
