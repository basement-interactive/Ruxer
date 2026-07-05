// SPDX-License-Identifier: AGPL-3.0-or-later

import RuntimeConfig from '@app/features/app/state/RuntimeConfig';
import type {User} from '@app/features/user/models/User';
import Users from '@app/features/user/state/Users';
import type {UserPartial} from '@fluxer/schema/src/domains/user/UserResponseSchemas';

export type RelationshipWire = Readonly<{
	id: string;
	type: number;
	user?: UserPartial;
	since: string;
	nickname?: string | null;
	share_voice_activity?: boolean;
	friend_shares_voice_activity?: boolean;
}>;

interface RelationshipRecordOptions {
	instanceId?: string;
}

export class Relationship {
	readonly instanceId: string;
	readonly id: string;
	readonly type: number;
	readonly userId: string;
	readonly since: Date;
	readonly nickname: string | null;
	readonly shareVoiceActivity: boolean;
	readonly friendSharesVoiceActivity: boolean;

	constructor(relationship: RelationshipWire, options?: RelationshipRecordOptions) {
		this.instanceId = options?.instanceId ?? RuntimeConfig.localInstanceDomain;
		if (relationship.user) {
			Users.cacheUsers([relationship.user]);
			this.userId = relationship.user.id;
		} else {
			this.userId = relationship.id;
		}
		this.id = relationship.id;
		this.type = relationship.type;
		this.since = new Date(relationship.since);
		this.nickname = relationship.nickname ?? null;
		this.shareVoiceActivity = relationship.share_voice_activity ?? true;
		this.friendSharesVoiceActivity = relationship.friend_shares_voice_activity ?? true;
	}

	get user(): User {
		return Users.getUser(this.userId)!;
	}

	withUpdates(relationship: Partial<RelationshipWire>): Relationship {
		const mergedUser = relationship.user
			? {
					...this.user?.toJSON(),
					...relationship.user,
				}
			: this.user?.toJSON();
		return new Relationship(
			{
				id: relationship.id ?? this.id,
				type: relationship.type ?? this.type,
				since: relationship.since ?? this.since.toISOString(),
				nickname: relationship.nickname === undefined ? this.nickname : relationship.nickname,
				user: mergedUser,
				share_voice_activity: relationship.share_voice_activity ?? this.shareVoiceActivity,
				friend_shares_voice_activity: relationship.friend_shares_voice_activity ?? this.friendSharesVoiceActivity,
			},
			{instanceId: this.instanceId},
		);
	}
}
