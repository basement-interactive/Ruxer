// SPDX-License-Identifier: AGPL-3.0-or-later

import GatewayConnection from '@app/features/gateway/transport/GatewayConnection';
import {
	createMemberListSubscriptionSnapshot,
	INITIAL_MEMBER_LIST_SUBSCRIPTION_RANGE,
	type MemberListRanges,
	type MemberListSubscriptionMachineEvent,
	selectMemberListSubscriptionModel,
	transitionMemberListSubscriptionSnapshot,
} from '@app/features/member/state/MemberListSubscriptionStateMachine';
import MemberSidebar from '@app/features/member/state/MemberSidebar';
import {
	areNormalizedMemberListRangesCovered,
	normalizeMemberListRanges,
} from '@app/features/member/utils/MemberListRangeUtils';
import Window from '@app/features/window/state/Window';
import {reaction} from 'mobx';
import {useCallback, useEffect, useRef, useSyncExternalStore} from 'react';

interface UseMemberListSubscriptionOptions {
	guildId: string;
	channelId: string;
	enabled: boolean;
}

interface UseMemberListSubscriptionResult {
	subscribe: (ranges: Array<[number, number]>) => void;
	unsubscribe: () => void;
	isPaused: boolean;
}

function subscribeToWindowFocus(onChange: () => void): () => void {
	return reaction(
		() => Window.focused,
		() => onChange(),
	);
}

function getWindowFocusSnapshot(): boolean {
	return Window.focused;
}

let nextMemberListSubscriptionOwnerId = 0;

function createMemberListSubscriptionOwnerId(): string {
	nextMemberListSubscriptionOwnerId += 1;
	return `member-list-subscription:${nextMemberListSubscriptionOwnerId}`;
}

export function useMemberListSubscription({
	guildId,
	channelId,
	enabled,
}: UseMemberListSubscriptionOptions): UseMemberListSubscriptionResult {
	const isWindowFocused = useSyncExternalStore(subscribeToWindowFocus, getWindowFocusSnapshot, getWindowFocusSnapshot);
	const isPaused = enabled && !isWindowFocused;
	const subscriptionSnapshotRef = useRef(
		createMemberListSubscriptionSnapshot({
			enabled,
			paused: enabled && !Window.focused,
			desiredRanges: [INITIAL_MEMBER_LIST_SUBSCRIPTION_RANGE],
		}),
	);
	const lastSessionVersionRef = useRef(MemberSidebar.sessionVersion);
	const lastGatewayReadyRef = useRef(GatewayConnection.isReady);
	const hadChannelListRef = useRef(MemberSidebar.getList(guildId, channelId) !== undefined);
	const retryTimerRef = useRef<number | null>(null);
	const ownerIdRef = useRef(createMemberListSubscriptionOwnerId());
	const ownerId = ownerIdRef.current;
	const readSubscriptionModel = useCallback(
		() => selectMemberListSubscriptionModel(subscriptionSnapshotRef.current),
		[],
	);
	const sendSubscriptionEvent = useCallback((event: MemberListSubscriptionMachineEvent) => {
		subscriptionSnapshotRef.current = transitionMemberListSubscriptionSnapshot(subscriptionSnapshotRef.current, event);
		return selectMemberListSubscriptionModel(subscriptionSnapshotRef.current);
	}, []);
	const clearRetryTimer = useCallback(() => {
		if (retryTimerRef.current != null) {
			window.clearTimeout(retryTimerRef.current);
			retryTimerRef.current = null;
		}
	}, []);
	const attemptSubscribe = useCallback(
		(ranges: MemberListRanges, forceSubscriptionUpdate = false) => {
			const normalizedRanges = normalizeMemberListRanges(ranges);
			const subscriptionModel = readSubscriptionModel();
			if (!enabled || !subscriptionModel.isActive) {
				return;
			}
			if (!MemberSidebar.isActiveMemberListSubscriptionOwner(guildId, channelId, ownerId)) {
				return;
			}
			const currentSubscribedRanges = MemberSidebar.getSubscribedRanges(guildId, channelId);
			const localStoreCoversDesiredRange = areNormalizedMemberListRangesCovered(
				normalizedRanges,
				currentSubscribedRanges,
			);
			const lastSubscriptionCoversDesiredRange = areNormalizedMemberListRangesCovered(
				normalizedRanges,
				subscriptionModel.subscribedRanges,
			);
			if (
				!forceSubscriptionUpdate &&
				subscriptionModel.isSubscribed &&
				localStoreCoversDesiredRange &&
				lastSubscriptionCoversDesiredRange
			) {
				return;
			}
			MemberSidebar.subscribeToChannel(guildId, channelId, normalizedRanges, forceSubscriptionUpdate, ownerId);
			sendSubscriptionEvent({
				type: 'memberListSubscription.subscriptionApplied',
				ranges: normalizedRanges,
			});
		},
		[guildId, channelId, enabled, ownerId, readSubscriptionModel, sendSubscriptionEvent],
	);
	const flushPendingSubscribe = useCallback(() => {
		const {isActive, pendingRanges} = readSubscriptionModel();
		if (!isActive) {
			return;
		}
		if (!pendingRanges) {
			return;
		}
		sendSubscriptionEvent({type: 'memberListSubscription.pendingFlushed'});
		attemptSubscribe(pendingRanges);
	}, [attemptSubscribe, readSubscriptionModel, sendSubscriptionEvent]);
	const queueSubscribe = useCallback(
		(ranges: MemberListRanges) => {
			const normalizedRanges = normalizeMemberListRanges(ranges);
			const model = sendSubscriptionEvent({
				type: 'memberListSubscription.rangesRequested',
				ranges: normalizedRanges,
			});
			if (!model.isActive) {
				return;
			}
			flushPendingSubscribe();
		},
		[flushPendingSubscribe, sendSubscriptionEvent],
	);
	const subscribe = useCallback(
		(ranges: MemberListRanges) => {
			queueSubscribe(ranges);
		},
		[queueSubscribe],
	);
	const clearSubscription = useCallback(
		(updateGateway: boolean) => {
			clearRetryTimer();
			const wasSubscribed = readSubscriptionModel().isSubscribed;
			const ownsSubscription = MemberSidebar.isActiveMemberListSubscriptionOwner(guildId, channelId, ownerId);
			const hasLocalSubscription = ownsSubscription && MemberSidebar.getSubscribedRanges(guildId, channelId).length > 0;
			sendSubscriptionEvent({type: 'memberListSubscription.subscriptionCleared'});
			if (wasSubscribed || hasLocalSubscription) {
				if (updateGateway) {
					MemberSidebar.unsubscribeFromChannel(guildId, channelId, true, ownerId);
				} else {
					MemberSidebar.releaseMemberListSubscription(guildId, channelId, ownerId);
				}
			}
		},
		[guildId, channelId, ownerId, clearRetryTimer, readSubscriptionModel, sendSubscriptionEvent],
	);
	const unsubscribe = useCallback(() => {
		clearSubscription(true);
	}, [clearSubscription]);
	const releaseSubscription = useCallback(() => {
		clearSubscription(false);
	}, [clearSubscription]);
	const pauseSubscription = useCallback(() => {
		clearRetryTimer();
		const model = readSubscriptionModel();
		const ownsSubscription = MemberSidebar.isActiveMemberListSubscriptionOwner(guildId, channelId, ownerId);
		const hasLocalSubscription = ownsSubscription && MemberSidebar.getSubscribedRanges(guildId, channelId).length > 0;
		sendSubscriptionEvent({type: 'memberListSubscription.paused'});
		if (model.isSubscribed || hasLocalSubscription) {
			MemberSidebar.releaseMemberListSubscription(guildId, channelId, ownerId);
		}
	}, [guildId, channelId, ownerId, clearRetryTimer, readSubscriptionModel, sendSubscriptionEvent]);
	const resubscribe = useCallback(() => {
		const {desiredRanges} = readSubscriptionModel();
		if (desiredRanges.length > 0) {
			attemptSubscribe(desiredRanges, true);
		}
	}, [attemptSubscribe, readSubscriptionModel]);
	useEffect(() => {
		sendSubscriptionEvent({
			type: 'memberListSubscription.reset',
			desiredRanges: [INITIAL_MEMBER_LIST_SUBSCRIPTION_RANGE],
		});
		lastSessionVersionRef.current = MemberSidebar.sessionVersion;
		lastGatewayReadyRef.current = GatewayConnection.isReady;
		hadChannelListRef.current = MemberSidebar.getList(guildId, channelId) !== undefined;
		clearRetryTimer();
	}, [guildId, channelId, clearRetryTimer, sendSubscriptionEvent]);
	useEffect(() => {
		if (!enabled) {
			unsubscribe();
			sendSubscriptionEvent({type: 'memberListSubscription.disabled'});
			return;
		}
		sendSubscriptionEvent({type: 'memberListSubscription.enabled'});
		const disposeSessionReaction = reaction(
			() => MemberSidebar.sessionVersion,
			(newVersion) => {
				if (newVersion !== lastSessionVersionRef.current) {
					lastSessionVersionRef.current = newVersion;
					sendSubscriptionEvent({type: 'memberListSubscription.subscriptionCleared'});
					if (readSubscriptionModel().isActive) {
						MemberSidebar.claimMemberListSubscription(guildId, channelId, ownerId);
						resubscribe();
					}
				}
			},
		);
		const disposeGatewayReadyReaction = reaction(
			() => GatewayConnection.isReady,
			(isReady) => {
				const wasReady = lastGatewayReadyRef.current;
				lastGatewayReadyRef.current = isReady;
				if (!enabled) {
					return;
				}
				if (isReady && !wasReady && readSubscriptionModel().isActive) {
					MemberSidebar.claimMemberListSubscription(guildId, channelId, ownerId);
					attemptSubscribe(readSubscriptionModel().desiredRanges, true);
				}
			},
		);
		const disposeGuildListReaction = reaction(
			() => MemberSidebar.getList(guildId, channelId) !== undefined,
			(hasChannelList) => {
				const hadChannelList = hadChannelListRef.current;
				hadChannelListRef.current = hasChannelList;
				if (hadChannelList && !hasChannelList) {
					sendSubscriptionEvent({type: 'memberListSubscription.subscriptionCleared'});
				}
				if (!hasChannelList && enabled && readSubscriptionModel().isActive) {
					MemberSidebar.claimMemberListSubscription(guildId, channelId, ownerId);
					resubscribe();
				}
			},
		);
		return () => {
			disposeSessionReaction();
			disposeGatewayReadyReaction();
			disposeGuildListReaction();
		};
	}, [
		guildId,
		channelId,
		enabled,
		resubscribe,
		unsubscribe,
		attemptSubscribe,
		ownerId,
		readSubscriptionModel,
		sendSubscriptionEvent,
	]);
	useEffect(() => {
		return () => {
			releaseSubscription();
		};
	}, [guildId, channelId, releaseSubscription]);
	useEffect(() => {
		if (!enabled) {
			return;
		}
		if (isWindowFocused) {
			MemberSidebar.claimMemberListSubscription(guildId, channelId, ownerId);
			sendSubscriptionEvent({type: 'memberListSubscription.resumed'});
			resubscribe();
			return;
		}
		pauseSubscription();
	}, [guildId, channelId, enabled, isWindowFocused, ownerId, pauseSubscription, resubscribe, sendSubscriptionEvent]);
	useEffect(() => {
		if (!enabled || !isWindowFocused) {
			return;
		}
		const scheduleRetry = () => {
			clearRetryTimer();
			const {retryDelayMs} = readSubscriptionModel();
			retryTimerRef.current = window.setTimeout(() => {
				retryTimerRef.current = null;
				if (!readSubscriptionModel().isActive) {
					return;
				}
				if (!MemberSidebar.isActiveMemberListSubscriptionOwner(guildId, channelId, ownerId)) {
					return;
				}
				const list = MemberSidebar.getList(guildId, channelId);
				if (list && list.items.size > 0) {
					sendSubscriptionEvent({type: 'memberListSubscription.retrySucceeded'});
					return;
				}
				attemptSubscribe(readSubscriptionModel().desiredRanges, true);
				sendSubscriptionEvent({type: 'memberListSubscription.retryBackedOff'});
				scheduleRetry();
			}, retryDelayMs);
		};
		const disposeRetryReaction = reaction(
			() => {
				const list = MemberSidebar.getList(guildId, channelId);
				return list != null && list.items.size > 0;
			},
			(hasData) => {
				if (hasData) {
					clearRetryTimer();
					sendSubscriptionEvent({type: 'memberListSubscription.retrySucceeded'});
				} else if (MemberSidebar.isActiveMemberListSubscriptionOwner(guildId, channelId, ownerId)) {
					scheduleRetry();
				} else {
					clearRetryTimer();
				}
			},
			{fireImmediately: true},
		);
		return () => {
			disposeRetryReaction();
			clearRetryTimer();
		};
	}, [
		guildId,
		channelId,
		enabled,
		isWindowFocused,
		attemptSubscribe,
		clearRetryTimer,
		ownerId,
		readSubscriptionModel,
		sendSubscriptionEvent,
	]);
	useEffect(() => {
		const {isActive, isSubscribed, desiredRanges} = readSubscriptionModel();
		if (
			enabled &&
			isWindowFocused &&
			isActive &&
			!isSubscribed &&
			MemberSidebar.isActiveMemberListSubscriptionOwner(guildId, channelId, ownerId)
		) {
			queueSubscribe(desiredRanges);
		}
	}, [guildId, channelId, enabled, isWindowFocused, ownerId, queueSubscribe, readSubscriptionModel]);
	return {subscribe, unsubscribe, isPaused};
}
