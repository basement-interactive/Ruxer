// SPDX-License-Identifier: AGPL-3.0-or-later

import type {ConnectionType} from '@fluxer/constants/src/ConnectionConstants';
import type {ConnectionResponse} from '@fluxer/schema/src/domains/connection/ConnectionSchemas';

export class Connection {
	readonly id: string;
	readonly type: ConnectionType;
	readonly name: string;
	readonly verified: boolean;
	readonly visibilityFlags: number;
	readonly sortOrder: number;

	constructor(connection: ConnectionResponse) {
		this.id = connection.id;
		this.type = connection.type;
		this.name = connection.name;
		this.verified = connection.verified;
		this.visibilityFlags = connection.visibility_flags;
		this.sortOrder = connection.sort_order;
	}

	equals(other: Connection): boolean {
		return (
			this.id === other.id &&
			this.type === other.type &&
			this.name === other.name &&
			this.verified === other.verified &&
			this.visibilityFlags === other.visibilityFlags &&
			this.sortOrder === other.sortOrder
		);
	}

	toJSON(): ConnectionResponse {
		return {
			id: this.id,
			type: this.type,
			name: this.name,
			verified: this.verified,
			visibility_flags: this.visibilityFlags,
			sort_order: this.sortOrder,
		};
	}
}
