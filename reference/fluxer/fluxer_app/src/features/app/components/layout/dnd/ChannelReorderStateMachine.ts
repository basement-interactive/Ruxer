// SPDX-License-Identifier: AGPL-3.0-or-later

import {DND_TYPES, type DragItem, type DropResult} from '@app/features/app/components/layout/types/DndTypes';
import {ChannelTypes} from '@fluxer/constants/src/ChannelConstants';
import {assign, getInitialSnapshot, type SnapshotFrom, setup, transition} from 'xstate';

export interface ChannelReorderPoint {
	x: number;
	y: number;
}

export interface ChannelReorderRect {
	top: number;
	bottom: number;
	left: number;
	right: number;
}

export interface ChannelReorderTarget {
	id: string;
	channelType: number;
	parentId: string | null;
	guildId: string;
}

export interface ChannelReorderIndicator {
	position: 'top' | 'bottom';
	isValid: boolean;
}

export interface ChannelReorderIntent {
	indicator: ChannelReorderIndicator;
	result: DropResult;
}

export type ChannelReorderBlockedReason =
	| 'same-source-and-target'
	| 'incompatible-channel-kind'
	| 'category-into-child-channel'
	| 'empty-target-rect'
	| 'unsupported-drag-item';

export interface ChannelReorderResolution {
	intent: ChannelReorderIntent | null;
	indicator: ChannelReorderIndicator | null;
	blockedReason: ChannelReorderBlockedReason | null;
	isVoiceParticipantTransfer: boolean;
}

export interface ChannelReorderMachineContext extends ChannelReorderResolution {}

export type ChannelReorderEvent =
	| {
			type: 'drag.hover';
			item: DragItem;
			target: ChannelReorderTarget;
			clientOffset: ChannelReorderPoint;
			targetRect: ChannelReorderRect;
	  }
	| {type: 'drag.leave'}
	| {type: 'drag.drop'};

type VerticalZone = 'before' | 'after';

const initialChannelReorderMachineContext: ChannelReorderMachineContext = {
	intent: null,
	indicator: null,
	blockedReason: null,
	isVoiceParticipantTransfer: false,
};

function isCategoryType(channelType: number): boolean {
	return channelType === ChannelTypes.GUILD_CATEGORY;
}

function isVoiceType(channelType: number): boolean {
	return channelType === ChannelTypes.GUILD_VOICE;
}

function isTextType(channelType: number): boolean {
	return channelType === ChannelTypes.GUILD_TEXT || channelType === ChannelTypes.GUILD_LINK;
}

function getTargetHeight(rect: ChannelReorderRect): number {
	return rect.bottom - rect.top;
}

function getVerticalZone(clientOffset: ChannelReorderPoint, rect: ChannelReorderRect): VerticalZone {
	const height = getTargetHeight(rect);
	const offsetY = Math.min(height, Math.max(0, clientOffset.y - rect.top));
	return offsetY < height / 2 ? 'before' : 'after';
}

function createIndicator(
	clientOffset: ChannelReorderPoint,
	rect: ChannelReorderRect,
	isValid: boolean,
): ChannelReorderIndicator {
	return {
		position: getVerticalZone(clientOffset, rect) === 'before' ? 'top' : 'bottom',
		isValid,
	};
}

function isReorderDragItem(item: DragItem): boolean {
	return item.type === DND_TYPES.CHANNEL || item.type === DND_TYPES.CATEGORY;
}

export function getChannelDropBlockedReason(
	item: DragItem,
	target: ChannelReorderTarget,
): ChannelReorderBlockedReason | null {
	if (item.id === target.id) return 'same-source-and-target';
	if (item.type === DND_TYPES.VOICE_PARTICIPANT) {
		return isVoiceType(target.channelType) ? null : 'incompatible-channel-kind';
	}
	if (!isReorderDragItem(item)) return 'unsupported-drag-item';
	const targetIsCategory = isCategoryType(target.channelType);
	const targetIsVoice = isVoiceType(target.channelType);
	const targetIsText = isTextType(target.channelType);
	if (item.type === DND_TYPES.CHANNEL) {
		if (item.channelType === ChannelTypes.GUILD_VOICE) {
			if (!targetIsCategory && !targetIsVoice && !targetIsText) return 'incompatible-channel-kind';
		} else if (targetIsVoice) {
			return 'incompatible-channel-kind';
		}
	}
	if (item.type === DND_TYPES.CATEGORY && target.parentId !== null && !targetIsCategory) {
		return 'category-into-child-channel';
	}
	return null;
}

export function canChannelDropOnTarget(item: DragItem, target: ChannelReorderTarget): boolean {
	return getChannelDropBlockedReason(item, target) === null;
}

export function resolveChannelReorderHover(
	item: DragItem,
	target: ChannelReorderTarget,
	clientOffset: ChannelReorderPoint,
	targetRect: ChannelReorderRect,
): ChannelReorderResolution {
	if (getTargetHeight(targetRect) <= 0) {
		return {
			intent: null,
			indicator: null,
			blockedReason: 'empty-target-rect',
			isVoiceParticipantTransfer: false,
		};
	}
	const blockedReason = getChannelDropBlockedReason(item, target);
	if (blockedReason) {
		return {
			intent: null,
			indicator: createIndicator(clientOffset, targetRect, false),
			blockedReason,
			isVoiceParticipantTransfer: false,
		};
	}
	if (item.type === DND_TYPES.VOICE_PARTICIPANT) {
		return {
			intent: null,
			indicator: null,
			blockedReason: null,
			isVoiceParticipantTransfer: true,
		};
	}
	const zone = getVerticalZone(clientOffset, targetRect);
	const indicator = createIndicator(clientOffset, targetRect, true);
	const targetIsCategory = isCategoryType(target.channelType);
	const result: DropResult =
		targetIsCategory && item.type !== DND_TYPES.CATEGORY
			? {
					targetId: target.id,
					position: zone === 'before' ? 'before' : 'inside',
					targetParentId: zone === 'before' ? target.parentId : target.id,
				}
			: {
					targetId: target.id,
					position: zone === 'before' ? 'before' : 'after',
					targetParentId: target.parentId,
				};
	return {
		intent: {
			indicator,
			result,
		},
		indicator,
		blockedReason: null,
		isVoiceParticipantTransfer: false,
	};
}

export const channelReorderStateMachine = setup({
	types: {} as {
		context: ChannelReorderMachineContext;
		events: ChannelReorderEvent;
	},
	guards: {
		hasIntent: ({context}) => context.intent !== null,
		isVoiceParticipantTransfer: ({context}) => context.isVoiceParticipantTransfer,
	},
	actions: {
		resolveHover: assign(({event}) => {
			if (event.type !== 'drag.hover') return initialChannelReorderMachineContext;
			return resolveChannelReorderHover(event.item, event.target, event.clientOffset, event.targetRect);
		}),
		clear: assign(() => initialChannelReorderMachineContext),
	},
}).createMachine({
	id: 'channelReorder',
	initial: 'idle',
	context: initialChannelReorderMachineContext,
	states: {
		idle: {
			on: {
				'drag.hover': {target: 'resolving', actions: 'resolveHover'},
				'drag.leave': {actions: 'clear'},
				'drag.drop': {actions: 'clear'},
			},
		},
		resolving: {
			always: [
				{target: 'targeting', guard: 'hasIntent'},
				{target: 'voiceParticipantTransfer', guard: 'isVoiceParticipantTransfer'},
				{target: 'blocked'},
			],
		},
		targeting: {
			on: {
				'drag.hover': {target: 'resolving', actions: 'resolveHover'},
				'drag.leave': {target: 'idle', actions: 'clear'},
				'drag.drop': {target: 'idle', actions: 'clear'},
			},
		},
		voiceParticipantTransfer: {
			on: {
				'drag.hover': {target: 'resolving', actions: 'resolveHover'},
				'drag.leave': {target: 'idle', actions: 'clear'},
				'drag.drop': {target: 'idle', actions: 'clear'},
			},
		},
		blocked: {
			on: {
				'drag.hover': {target: 'resolving', actions: 'resolveHover'},
				'drag.leave': {target: 'idle', actions: 'clear'},
				'drag.drop': {target: 'idle', actions: 'clear'},
			},
		},
	},
});

export type ChannelReorderSnapshot = SnapshotFrom<typeof channelReorderStateMachine>;
export type ChannelReorderStateValue = 'idle' | 'resolving' | 'targeting' | 'voiceParticipantTransfer' | 'blocked';

export function createChannelReorderSnapshot(): ChannelReorderSnapshot {
	return getInitialSnapshot(channelReorderStateMachine);
}

export function transitionChannelReorderSnapshot(
	snapshot: ChannelReorderSnapshot,
	event: ChannelReorderEvent,
): ChannelReorderSnapshot {
	return transition(channelReorderStateMachine, snapshot, event)[0] as ChannelReorderSnapshot;
}

export function getChannelReorderStateValue(snapshot: ChannelReorderSnapshot): ChannelReorderStateValue {
	return snapshot.value as ChannelReorderStateValue;
}

export function selectChannelReorderResolution(
	item: DragItem,
	target: ChannelReorderTarget,
	clientOffset: ChannelReorderPoint,
	targetRect: ChannelReorderRect,
): ChannelReorderResolution {
	const snapshot = transitionChannelReorderSnapshot(createChannelReorderSnapshot(), {
		type: 'drag.hover',
		item,
		target,
		clientOffset,
		targetRect,
	});
	return snapshot.context;
}

export function selectChannelReorderIntent(
	item: DragItem,
	target: ChannelReorderTarget,
	clientOffset: ChannelReorderPoint,
	targetRect: ChannelReorderRect,
): ChannelReorderIntent | null {
	return selectChannelReorderResolution(item, target, clientOffset, targetRect).intent;
}
