// SPDX-License-Identifier: AGPL-3.0-or-later

import {useCallback, useMemo, useState} from 'react';

const LOCKED_SCOPES = new Set(['bot']);

export interface ScopeSelection {
	selected: ReadonlySet<string>;
	toggle: (scope: string) => void;
	isLocked: (scope: string) => boolean;
	adjusted: boolean;
	toScopeString: () => string;
}

export function useScopeSelection(requested: ReadonlyArray<string>): ScopeSelection {
	const [overrides, setOverrides] = useState<ReadonlyMap<string, boolean>>(() => new Map());
	const selected = useMemo(() => {
		const next = new Set<string>();
		for (const scope of requested) {
			const override = overrides.get(scope);
			if (override === false && !LOCKED_SCOPES.has(scope)) continue;
			next.add(scope);
		}
		return next;
	}, [requested, overrides]);
	const toggle = useCallback((scope: string) => {
		if (LOCKED_SCOPES.has(scope)) return;
		setOverrides((prev) => {
			const next = new Map(prev);
			const currentlyOff = prev.get(scope) === false;
			if (currentlyOff) next.delete(scope);
			else next.set(scope, false);
			return next;
		});
	}, []);
	const isLocked = useCallback((scope: string) => LOCKED_SCOPES.has(scope), []);
	const adjusted = useMemo(() => requested.length > 0 && selected.size < requested.length, [requested, selected]);
	const toScopeString = useCallback(() => Array.from(selected).join(' '), [selected]);
	return {selected, toggle, isLocked, adjusted, toScopeString};
}
