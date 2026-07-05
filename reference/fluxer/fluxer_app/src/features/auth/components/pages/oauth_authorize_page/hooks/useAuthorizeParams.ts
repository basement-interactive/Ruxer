// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	type AuthorizeParams,
	parseAuthorizeQuery,
	safeRedirectHostname,
	splitScopes,
} from '@app/features/auth/components/pages/oauth_authorize_page/OAuthAuthorizePageShared';
import {useMemo} from 'react';

export interface AuthorizeParamsResult {
	params: AuthorizeParams | null;
	scopes: ReadonlyArray<string>;
	hasBotScope: boolean;
	isBotOnly: boolean;
	redirectHostname: string | null;
	botInviteWithoutRedirect: boolean;
}

export function useAuthorizeParams(search?: string): AuthorizeParamsResult {
	return useMemo(() => {
		const params = parseAuthorizeQuery(search ?? window.location.search);
		const scopes = params ? splitScopes(params.scope) : [];
		const hasBotScope = scopes.includes('bot');
		const isBotOnly = scopes.length === 1 && scopes[0] === 'bot';
		return {
			params,
			scopes,
			hasBotScope,
			isBotOnly,
			redirectHostname: safeRedirectHostname(params?.redirectUri ?? null),
			botInviteWithoutRedirect: hasBotScope && !params?.redirectUri,
		};
	}, [search]);
}
