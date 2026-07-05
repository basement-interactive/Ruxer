// SPDX-License-Identifier: AGPL-3.0-or-later

import {z} from 'zod';

export const BlueskyAuthorizeRequest = z.object({
	handle: z.string().min(1).max(253).describe('The Bluesky handle to connect (e.g. alice.bsky.social)'),
});

export type BlueskyAuthorizeRequest = z.infer<typeof BlueskyAuthorizeRequest>;

export const BlueskyAuthorizeResponse = z.object({
	authorize_url: z.string().describe('The URL to redirect the user to for Bluesky authorisation'),
});

export type BlueskyAuthorizeResponse = z.infer<typeof BlueskyAuthorizeResponse>;
