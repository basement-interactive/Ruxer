// SPDX-License-Identifier: AGPL-3.0-or-later

import type {GatewayHandlerContext} from '@app/features/gateway/events/EventRouter';
import MemberSearch from '@app/features/member/state/MemberSearch';
import Messages from '@app/features/messaging/state/MessagingMessages';
import ReadStates from '@app/features/read_state/state/ReadStates';
import type {RelationshipWire} from '@app/features/relationship/models/Relationship';
import Relationships from '@app/features/relationship/state/Relationships';
import QuickSwitcher from '@app/features/search/state/QuickSwitcher';
import Notification from '@app/features/ui/state/Notification';
import {RelationshipTypes} from '@fluxer/constants/src/UserConstants';

interface RelationshipPayload {
	id: string;
	type: number;
}

export function handleRelationshipUpdate(data: RelationshipPayload, _context: GatewayHandlerContext): void {
	Relationships.updateRelationship(data as RelationshipWire);
	MemberSearch.handleFriendshipChange(data.id, data.type === RelationshipTypes.FRIEND);
	Messages.handleRelationshipUpdate();
	ReadStates.handleRelationshipUpdate();
	QuickSwitcher.recomputeIfOpen();
	Notification.handleRelationshipNotification(data as RelationshipWire, {event: 'update'});
}
