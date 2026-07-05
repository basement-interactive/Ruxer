// SPDX-License-Identifier: AGPL-3.0-or-later

import {Logger} from '@app/features/platform/utils/AppLogger';

export interface PermissionOverwrite {
	id: string;
	type: 0 | 1;
	allow: bigint;
	deny: bigint;
}

export const CHANNEL_PERMISSIONS_TAB_ID = 'permissions';
export const channelPermissionsTabLogger = new Logger('ChannelPermissionsTab');
