// SPDX-License-Identifier: AGPL-3.0-or-later

import type {GatewayHandlerContext} from '@app/features/gateway/events/EventRouter';
import MemberSearch from '@app/features/member/state/MemberSearch';
import Messages from '@app/features/messaging/state/MessagingMessages';
import ReadStates from '@app/features/read_state/state/ReadStates';
import Relationships from '@app/features/relationship/state/Relationships';
import QuickSwitcher from '@app/features/search/state/QuickSwitcher';

interface RelationshipRemovePayload {
	id: string;
}

export function handleRelationshipRemove(data: RelationshipRemovePayload, _context: GatewayHandlerContext): void {
	Relationships.removeRelationship(data.id);
	MemberSearch.handleFriendshipChange(data.id, false);
	Messages.handleRelationshipUpdate();
	ReadStates.handleRelationshipUpdate();
	QuickSwitcher.recomputeIfOpen();
}
