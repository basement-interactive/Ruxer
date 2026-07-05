// SPDX-License-Identifier: AGPL-3.0-or-later

import UserConnection from '@app/features/connection/state/UserConnection';
import type {GatewayHandlerContext} from '@app/features/gateway/events/EventRouter';
import type {ConnectionListResponse} from '@fluxer/schema/src/domains/connection/ConnectionSchemas';

export function handleUserConnectionsUpdate(
	data: {
		connections: ConnectionListResponse;
	},
	_context: GatewayHandlerContext,
): void {
	UserConnection.setConnections(data.connections);
}
