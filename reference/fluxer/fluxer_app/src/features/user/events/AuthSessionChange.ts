// SPDX-License-Identifier: AGPL-3.0-or-later

import AuthSession from '@app/features/auth/state/AuthSession';
import type {GatewayHandlerContext} from '@app/features/gateway/events/EventRouter';

interface AuthSessionChangePayload {
	new_token?: string;
	new_auth_session_id_hash?: string | null;
}

export function handleAuthSessionChange(data: AuthSessionChangePayload, context: GatewayHandlerContext): void {
	if (data.new_token) {
		context.socket?.setToken(data.new_token);
	}
	if (data.new_auth_session_id_hash) {
		AuthSession.handleAuthSessionChange(data.new_auth_session_id_hash);
	}
}
