// SPDX-License-Identifier: AGPL-3.0-or-later

import {logger} from '@app/features/auth/components/pages/oauth_authorize_page/OAuthAuthorizePageShared';
import {
	type BotPermissionOption,
	formatBotPermissionsQuery,
	getAllBotPermissions,
} from '@app/features/permissions/utils/PermissionUtils';
import {normalizeBotInvitePermissions} from '@fluxer/constants/src/BotPermissionUtils';
import {Permissions} from '@fluxer/constants/src/ChannelConstants';
import {useLingui} from '@lingui/react/macro';
import {useCallback, useMemo, useState} from 'react';

export interface PermissionSelection {
	options: ReadonlyArray<BotPermissionOption>;
	requestedKeys: ReadonlyArray<string>;
	selected: ReadonlySet<string>;
	toggle: (permissionId: string) => void;
	adjusted: boolean;
	requestsAdmin: boolean;
	requestedBitfield: bigint;
	toBitfield: () => string | undefined;
}

export function usePermissionSelection(rawPermissions: string | null): PermissionSelection {
	const {i18n} = useLingui();
	const options = useMemo(() => getAllBotPermissions(i18n), [i18n.locale]);
	const requestedBitfield = useMemo(() => {
		if (!rawPermissions) return 0n;
		try {
			const parsed = BigInt(rawPermissions);
			if (parsed < 0n) return 0n;
			return normalizeBotInvitePermissions(parsed);
		} catch (err) {
			logger.warn('Failed to parse requested permissions', err);
			return 0n;
		}
	}, [rawPermissions]);
	const requestedKeys = useMemo<ReadonlyArray<string>>(() => {
		if (!rawPermissions) return [];
		return options
			.filter((opt) => {
				const flag = Permissions[opt.id as keyof typeof Permissions];
				return flag != null && (requestedBitfield & flag) === flag;
			})
			.map((opt) => opt.id);
	}, [rawPermissions, requestedBitfield, options]);
	const [overrides, setOverrides] = useState<ReadonlyMap<string, boolean>>(() => new Map());
	const selected = useMemo(() => {
		const next = new Set<string>();
		for (const id of requestedKeys) {
			if (overrides.get(id) === false) continue;
			next.add(id);
		}
		return next;
	}, [requestedKeys, overrides]);
	const toggle = useCallback((permissionId: string) => {
		setOverrides((prev) => {
			const next = new Map(prev);
			const currentlyOff = prev.get(permissionId) === false;
			if (currentlyOff) next.delete(permissionId);
			else next.set(permissionId, false);
			return next;
		});
	}, []);
	const adjusted = useMemo(
		() => requestedKeys.length > 0 && selected.size < requestedKeys.length,
		[requestedKeys, selected],
	);
	const requestsAdmin = useMemo(() => requestedKeys.includes('ADMINISTRATOR'), [requestedKeys]);
	const toBitfield = useCallback(() => formatBotPermissionsQuery(Array.from(selected)), [selected]);
	return {options, requestedKeys, selected, toggle, adjusted, requestsAdmin, requestedBitfield, toBitfield};
}
