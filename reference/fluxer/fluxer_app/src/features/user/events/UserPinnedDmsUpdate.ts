// SPDX-License-Identifier: AGPL-3.0-or-later

import type {GatewayHandlerContext} from '@app/features/gateway/events/EventRouter';
import UserPinnedDM from '@app/features/user/state/UserPinnedDM';

export function handleUserPinnedDmsUpdate(data: ReadonlyArray<string>, _context: GatewayHandlerContext): void {
	UserPinnedDM.setPinnedDMs([...data]);
}
