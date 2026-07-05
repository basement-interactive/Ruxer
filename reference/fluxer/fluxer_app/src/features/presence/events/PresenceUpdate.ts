// SPDX-License-Identifier: AGPL-3.0-or-later

import type {GatewayHandlerContext} from '@app/features/gateway/events/EventRouter';
import type {PresenceRecord} from '@app/features/gateway/types/GatewayPresenceTypes';
import Presence from '@app/features/presence/state/Presence';

export function handlePresenceUpdate(data: PresenceRecord, _context: GatewayHandlerContext): void {
	Presence.handlePresenceUpdate(data);
}
