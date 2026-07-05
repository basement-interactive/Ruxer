// SPDX-License-Identifier: AGPL-3.0-or-later

import type {ValueOf} from '@fluxer/constants/src/ValueOf';

export const StatusTypes = {
	ONLINE: 'online',
	DND: 'dnd',
	IDLE: 'idle',
	INVISIBLE: 'invisible',
	OFFLINE: 'offline',
} as const;

export type StatusType = ValueOf<typeof StatusTypes>;

const STATUS_VALUES = Object.values(StatusTypes) as Array<StatusType>;
const STATUS_SET = new Set<StatusType>(STATUS_VALUES);

export function isStatusType(value: unknown): value is StatusType {
	return typeof value === 'string' && STATUS_SET.has(value as StatusType);
}

export function normalizeStatus(value: unknown): StatusType {
	return isStatusType(value) ? value : StatusTypes.OFFLINE;
}

export function isOfflineStatus(
	status: StatusType,
): status is typeof StatusTypes.OFFLINE | typeof StatusTypes.INVISIBLE {
	return status === StatusTypes.OFFLINE || status === StatusTypes.INVISIBLE;
}
