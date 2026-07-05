// SPDX-License-Identifier: AGPL-3.0-or-later

import type {MessageSearchScope} from '@app/features/search/utils/SearchUtils';

interface ResolveSearchScopeParams {
	activeScope?: MessageSearchScope | null;
	fallbackScope: MessageSearchScope;
	parsedScope?: MessageSearchScope;
	scopeOverride?: MessageSearchScope | null;
	scopeOptionValues: ReadonlySet<MessageSearchScope>;
}

export const resolveSearchScope = ({
	activeScope,
	fallbackScope,
	parsedScope,
	scopeOverride,
	scopeOptionValues,
}: ResolveSearchScopeParams): MessageSearchScope => {
	const requestedScope = scopeOverride ?? undefined;
	if (requestedScope && scopeOptionValues.has(requestedScope)) {
		return requestedScope;
	}
	if (!requestedScope && parsedScope && scopeOptionValues.has(parsedScope)) {
		return parsedScope;
	}
	const currentScope = activeScope ?? fallbackScope;
	return scopeOptionValues.has(currentScope) ? currentScope : fallbackScope;
};
