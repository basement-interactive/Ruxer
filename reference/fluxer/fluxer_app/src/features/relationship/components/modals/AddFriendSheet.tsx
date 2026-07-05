// SPDX-License-Identifier: AGPL-3.0-or-later

import {AddFriendForm} from '@app/features/channel/components/direct_message/AddFriendForm';
import {MobileFriendRequestItem} from '@app/features/channel/components/friends/MobileFriendRequestItem';
import styles from '@app/features/relationship/components/modals/AddFriendSheet.module.css';
import Relationships from '@app/features/relationship/state/Relationships';
import {ADD_FRIEND_DESCRIPTOR} from '@app/features/relationship/utils/RelationshipMessageDescriptors';
import {BottomSheet} from '@app/features/ui/bottom_sheet/BottomSheet';
import {Scroller} from '@app/features/ui/components/Scroller';
import {RelationshipTypes} from '@fluxer/constants/src/UserConstants';
import {ph} from '@lingui/core/macro';
import {Trans, useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import React from 'react';

interface AddFriendSheetProps {
	isOpen: boolean;
	onClose: () => void;
}

export const AddFriendSheet: React.FC<AddFriendSheetProps> = observer(({isOpen, onClose}) => {
	const {i18n} = useLingui();
	const relationships = Relationships.getRelationships();
	const incomingRequests = relationships.filter((relation) => relation.type === RelationshipTypes.INCOMING_REQUEST);
	const outgoingRequests = relationships.filter((relation) => relation.type === RelationshipTypes.OUTGOING_REQUEST);
	const incomingRequestCount = incomingRequests.length;
	const outgoingRequestCount = outgoingRequests.length;
	const hasPendingRequests = incomingRequests.length > 0 || outgoingRequests.length > 0;
	return (
		<BottomSheet
			isOpen={isOpen}
			onClose={onClose}
			snapPoints={[0, 1]}
			initialSnap={1}
			title={i18n._(ADD_FRIEND_DESCRIPTOR)}
			disablePadding
			data-flx="relationship.add-friend-sheet.bottom-sheet"
		>
			<div className={styles.container} data-flx="relationship.add-friend-sheet.container">
				<Scroller
					className={styles.scroller}
					key="add-friend-sheet-scroller"
					data-flx="relationship.add-friend-sheet.scroller"
				>
					<div className={styles.content} data-flx="relationship.add-friend-sheet.content">
						<AddFriendForm data-flx="relationship.add-friend-sheet.add-friend-form" />
						{hasPendingRequests && (
							<div className={styles.requestsSection} data-flx="relationship.add-friend-sheet.requests-section">
								{incomingRequests.length > 0 && (
									<div className={styles.requestsGroup} data-flx="relationship.add-friend-sheet.requests-group">
										<div className={styles.requestsHeader} data-flx="relationship.add-friend-sheet.requests-header">
											<Trans>Incoming friend requests ({ph({requestCount: incomingRequestCount})})</Trans>
										</div>
										<div className={styles.requestsList} data-flx="relationship.add-friend-sheet.requests-list">
											{incomingRequests.map((request, index) => (
												<React.Fragment key={request.id}>
													<MobileFriendRequestItem
														userId={request.id}
														relationshipType={RelationshipTypes.INCOMING_REQUEST}
														data-flx="relationship.add-friend-sheet.mobile-friend-request-item"
													/>
													{index < incomingRequests.length - 1 && (
														<div
															className={styles.requestDivider}
															data-flx="relationship.add-friend-sheet.request-divider"
														/>
													)}
												</React.Fragment>
											))}
										</div>
									</div>
								)}
								{outgoingRequests.length > 0 && (
									<div className={styles.requestsGroup} data-flx="relationship.add-friend-sheet.requests-group--2">
										<div className={styles.requestsHeader} data-flx="relationship.add-friend-sheet.requests-header--2">
											<Trans>Outgoing friend requests ({ph({requestCount: outgoingRequestCount})})</Trans>
										</div>
										<div className={styles.requestsList} data-flx="relationship.add-friend-sheet.requests-list--2">
											{outgoingRequests.map((request, index) => (
												<React.Fragment key={request.id}>
													<MobileFriendRequestItem
														userId={request.id}
														relationshipType={RelationshipTypes.OUTGOING_REQUEST}
														data-flx="relationship.add-friend-sheet.mobile-friend-request-item--2"
													/>
													{index < outgoingRequests.length - 1 && (
														<div
															className={styles.requestDivider}
															data-flx="relationship.add-friend-sheet.request-divider--2"
														/>
													)}
												</React.Fragment>
											))}
										</div>
									</div>
								)}
							</div>
						)}
					</div>
				</Scroller>
			</div>
		</BottomSheet>
	);
});
