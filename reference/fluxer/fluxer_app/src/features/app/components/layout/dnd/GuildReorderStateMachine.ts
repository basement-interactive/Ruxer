// SPDX-License-Identifier: AGPL-3.0-or-later

import type {GuildDragItem, GuildDropResult} from '@app/features/app/components/layout/types/DndTypes';
import {assign, getInitialSnapshot, type SnapshotFrom, setup, transition} from 'xstate';

export interface GuildReorderPoint {
	x: number;
	y: number;
}

export interface GuildReorderRect {
	top: number;
	bottom: number;
	left: number;
	right: number;
}

export type GuildReorderTargetKind = 'guild' | 'folder';

export interface GuildReorderTarget {
	id: string;
	kind: GuildReorderTargetKind;
	folderId?: number | null;
	isTerminal?: boolean;
}

export type GuildReorderIndicator = 'top' | 'bottom' | 'inside' | 'combine';

export interface GuildReorderIntent {
	indicator: GuildReorderIndicator;
	combineSourceGuildId: string | null;
	result: GuildDropResult;
}

export type GuildReorderBlockedReason = 'same-source-and-target' | 'folder-into-folder-guild' | 'empty-target-rect';

export interface GuildReorderMachineContext {
	intent: GuildReorderIntent | null;
	blockedReason: GuildReorderBlockedReason | null;
}

export type GuildReorderEvent =
	| {
			type: 'drag.hover';
			item: GuildDragItem;
			target: GuildReorderTarget;
			clientOffset: GuildReorderPoint;
			targetRect: GuildReorderRect;
	  }
	| {type: 'drag.leave'}
	| {type: 'drag.drop'};

export interface GuildReorderHoverResolution {
	intent: GuildReorderIntent | null;
	blockedReason: GuildReorderBlockedReason | null;
}

type VerticalZone = 'before' | 'center' | 'after';

const initialGuildReorderMachineContext: GuildReorderMachineContext = {
	intent: null,
	blockedReason: null,
};

function getTargetHeight(rect: GuildReorderRect): number {
	return rect.bottom - rect.top;
}

function getVerticalZone(clientOffset: GuildReorderPoint, rect: GuildReorderRect, edgeThreshold: number): VerticalZone {
	const height = getTargetHeight(rect);
	const offsetY = Math.min(height, Math.max(0, clientOffset.y - rect.top));
	if (edgeThreshold >= 0.5) {
		return offsetY < height / 2 ? 'before' : 'after';
	}
	const threshold = height * edgeThreshold;
	if (offsetY < threshold) return 'before';
	if (offsetY > height - threshold) return 'after';
	return 'center';
}

function createDropResult(target: GuildReorderTarget, position: GuildDropResult['position']): GuildDropResult {
	const result: GuildDropResult = {
		targetId: target.id,
		position,
		targetIsFolder: target.kind === 'folder',
	};
	if (target.kind === 'guild' && target.folderId != null) {
		result.targetFolderId = target.folderId;
	}
	return result;
}

function createIntent(
	target: GuildReorderTarget,
	indicator: GuildReorderIndicator,
	position: GuildDropResult['position'],
	combineSourceGuildId: string | null = null,
): GuildReorderIntent {
	return {
		indicator,
		combineSourceGuildId,
		result: createDropResult(target, position),
	};
}

export function getGuildReorderBlockedReason(
	item: GuildDragItem,
	target: GuildReorderTarget,
	targetRect?: GuildReorderRect,
): GuildReorderBlockedReason | null {
	if (item.id === target.id) return 'same-source-and-target';
	if (target.kind === 'guild' && target.folderId != null && item.isFolder) return 'folder-into-folder-guild';
	if (targetRect && getTargetHeight(targetRect) <= 0) return 'empty-target-rect';
	return null;
}

export function canGuildDropOnTarget(item: GuildDragItem, target: GuildReorderTarget): boolean {
	return getGuildReorderBlockedReason(item, target) === null;
}

export function resolveGuildReorderHover(
	item: GuildDragItem,
	target: GuildReorderTarget,
	clientOffset: GuildReorderPoint,
	targetRect: GuildReorderRect,
): GuildReorderHoverResolution {
	const blockedReason = getGuildReorderBlockedReason(item, target, targetRect);
	if (blockedReason) {
		return {intent: null, blockedReason};
	}
	if (target.kind === 'folder') {
		if (item.isFolder) {
			return {intent: createIntent(target, 'top', 'before'), blockedReason: null};
		}
		const zone = getVerticalZone(clientOffset, targetRect, 0.25);
		if (zone === 'before') {
			return {intent: createIntent(target, 'top', 'before'), blockedReason: null};
		}
		return {intent: createIntent(target, 'inside', 'inside'), blockedReason: null};
	}
	if (target.folderId != null) {
		const zone = getVerticalZone(clientOffset, targetRect, 0.5);
		if (target.isTerminal && zone === 'after') {
			return {intent: createIntent(target, 'bottom', 'after'), blockedReason: null};
		}
		return {intent: createIntent(target, 'top', 'before'), blockedReason: null};
	}
	if (item.isFolder) {
		return {intent: createIntent(target, 'top', 'before'), blockedReason: null};
	}
	const zone = getVerticalZone(clientOffset, targetRect, 0.25);
	if (zone === 'before') {
		return {intent: createIntent(target, 'top', 'before'), blockedReason: null};
	}
	return {intent: createIntent(target, 'combine', 'combine', item.id), blockedReason: null};
}

export const guildReorderStateMachine = setup({
	types: {} as {
		context: GuildReorderMachineContext;
		events: GuildReorderEvent;
	},
	guards: {
		hasIntent: ({context}) => context.intent !== null,
	},
	actions: {
		resolveHover: assign(({event}) => {
			if (event.type !== 'drag.hover') return initialGuildReorderMachineContext;
			return resolveGuildReorderHover(event.item, event.target, event.clientOffset, event.targetRect);
		}),
		clear: assign(() => initialGuildReorderMachineContext),
	},
}).createMachine({
	id: 'guildReorder',
	initial: 'idle',
	context: initialGuildReorderMachineContext,
	states: {
		idle: {
			on: {
				'drag.hover': {target: 'resolving', actions: 'resolveHover'},
				'drag.leave': {actions: 'clear'},
				'drag.drop': {actions: 'clear'},
			},
		},
		resolving: {
			always: [{target: 'targeting', guard: 'hasIntent'}, {target: 'blocked'}],
		},
		targeting: {
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

export type GuildReorderSnapshot = SnapshotFrom<typeof guildReorderStateMachine>;
export type GuildReorderStateValue = 'idle' | 'resolving' | 'targeting' | 'blocked';

export function createGuildReorderSnapshot(): GuildReorderSnapshot {
	return getInitialSnapshot(guildReorderStateMachine);
}

export function transitionGuildReorderSnapshot(
	snapshot: GuildReorderSnapshot,
	event: GuildReorderEvent,
): GuildReorderSnapshot {
	return transition(guildReorderStateMachine, snapshot, event)[0] as GuildReorderSnapshot;
}

export function getGuildReorderStateValue(snapshot: GuildReorderSnapshot): GuildReorderStateValue {
	return snapshot.value as GuildReorderStateValue;
}

export function selectGuildReorderIntent(
	item: GuildDragItem,
	target: GuildReorderTarget,
	clientOffset: GuildReorderPoint,
	targetRect: GuildReorderRect,
): GuildReorderIntent | null {
	const snapshot = transitionGuildReorderSnapshot(createGuildReorderSnapshot(), {
		type: 'drag.hover',
		item,
		target,
		clientOffset,
		targetRect,
	});
	return snapshot.context.intent;
}
