// SPDX-License-Identifier: AGPL-3.0-or-later

import {DND_TYPES, type GuildDragItem} from '@app/features/app/components/layout/types/DndTypes';
import {describe, expect, it} from 'vitest';
import {
	canGuildDropOnTarget,
	createGuildReorderSnapshot,
	type GuildReorderRect,
	type GuildReorderTarget,
	getGuildReorderStateValue,
	resolveGuildReorderHover,
	selectGuildReorderIntent,
	transitionGuildReorderSnapshot,
} from './GuildReorderStateMachine';

const rect: GuildReorderRect = {
	top: 100,
	bottom: 154,
	left: 0,
	right: 72,
};

function guildItem(id: string, folderId: number | null = null): GuildDragItem {
	return {
		type: DND_TYPES.GUILD_ITEM,
		id,
		isFolder: false,
		folderId,
	};
}

function folderItem(id = 'folder-1', folderId = 1): GuildDragItem {
	return {
		type: DND_TYPES.GUILD_FOLDER,
		id,
		isFolder: true,
		folderId,
	};
}

function rootGuildTarget(id = 'guild-target'): GuildReorderTarget {
	return {
		id,
		kind: 'guild',
	};
}

function folderGuildTarget(id = 'guild-target', isTerminal = false): GuildReorderTarget {
	return {
		id,
		kind: 'guild',
		folderId: 1,
		isTerminal,
	};
}

function folderTarget(id = 'folder-1'): GuildReorderTarget {
	return {
		id,
		kind: 'folder',
	};
}

function point(y: number) {
	return {
		x: 36,
		y,
	};
}

describe('GuildReorderStateMachine', () => {
	it('starts idle and targets a valid top-level reorder hover', () => {
		let snapshot = createGuildReorderSnapshot();
		expect(getGuildReorderStateValue(snapshot)).toBe('idle');
		snapshot = transitionGuildReorderSnapshot(snapshot, {
			type: 'drag.hover',
			item: guildItem('guild-source'),
			target: rootGuildTarget(),
			clientOffset: point(104),
			targetRect: rect,
		});
		expect(getGuildReorderStateValue(snapshot)).toBe('targeting');
		expect(snapshot.context.intent?.result).toMatchObject({
			targetId: 'guild-target',
			position: 'before',
			targetIsFolder: false,
		});
		expect(snapshot.context.intent?.indicator).toBe('top');
	});

	it('moves to blocked state for invalid hovers and clears on leave', () => {
		let snapshot = createGuildReorderSnapshot();
		snapshot = transitionGuildReorderSnapshot(snapshot, {
			type: 'drag.hover',
			item: guildItem('guild-target'),
			target: rootGuildTarget('guild-target'),
			clientOffset: point(104),
			targetRect: rect,
		});
		expect(getGuildReorderStateValue(snapshot)).toBe('blocked');
		expect(snapshot.context.blockedReason).toBe('same-source-and-target');
		snapshot = transitionGuildReorderSnapshot(snapshot, {type: 'drag.leave'});
		expect(getGuildReorderStateValue(snapshot)).toBe('idle');
		expect(snapshot.context.intent).toBeNull();
		expect(snapshot.context.blockedReason).toBeNull();
	});

	it('clears targeting state after drop', () => {
		let snapshot = createGuildReorderSnapshot();
		snapshot = transitionGuildReorderSnapshot(snapshot, {
			type: 'drag.hover',
			item: guildItem('guild-source'),
			target: rootGuildTarget(),
			clientOffset: point(104),
			targetRect: rect,
		});
		snapshot = transitionGuildReorderSnapshot(snapshot, {type: 'drag.drop'});
		expect(getGuildReorderStateValue(snapshot)).toBe('idle');
		expect(snapshot.context.intent).toBeNull();
	});

	it('covers every pixel of a top-level guild target with either reorder-before or combine', () => {
		const source = guildItem('guild-source');
		const target = rootGuildTarget();
		for (let y = rect.top; y <= rect.bottom; y++) {
			const intent = selectGuildReorderIntent(source, target, point(y), rect);
			expect(intent, `expected intent for y=${y}`).not.toBeNull();
			expect(['before', 'combine']).toContain(intent?.result.position);
		}
	});

	it('uses one top-level insertion target between adjacent guilds by never returning after from an item hover', () => {
		const source = guildItem('guild-source');
		const target = rootGuildTarget('guild-next');
		const upperEdgeIntent = selectGuildReorderIntent(source, target, point(101), rect);
		const middleIntent = selectGuildReorderIntent(source, target, point(130), rect);
		const lowerEdgeIntent = selectGuildReorderIntent(source, target, point(153), rect);
		expect(upperEdgeIntent?.result.position).toBe('before');
		expect(middleIntent?.result.position).toBe('combine');
		expect(lowerEdgeIntent?.result.position).toBe('combine');
		expect(middleIntent?.result.position).not.toBe('after');
		expect(lowerEdgeIntent?.result.position).not.toBe('after');
	});

	it('maps root guild top edge to reorder and center/bottom to folder combine for guild sources', () => {
		const source = guildItem('guild-source');
		const target = rootGuildTarget();
		expect(selectGuildReorderIntent(source, target, point(100), rect)).toMatchObject({
			indicator: 'top',
			result: {position: 'before'},
		});
		expect(selectGuildReorderIntent(source, target, point(114), rect)).toMatchObject({
			indicator: 'combine',
			combineSourceGuildId: 'guild-source',
			result: {position: 'combine'},
		});
		expect(selectGuildReorderIntent(source, target, point(154), rect)).toMatchObject({
			indicator: 'combine',
			combineSourceGuildId: 'guild-source',
			result: {position: 'combine'},
		});
	});

	it('does not combine folders with root guilds while dragging a folder', () => {
		const source = folderItem();
		const target = rootGuildTarget();
		for (const y of [rect.top, 127, rect.bottom]) {
			expect(selectGuildReorderIntent(source, target, point(y), rect)).toMatchObject({
				indicator: 'top',
				result: {
					position: 'before',
					targetIsFolder: false,
				},
			});
		}
	});

	it('uses a single before-target slot for non-terminal guilds inside a folder', () => {
		const source = guildItem('guild-source', 1);
		const target = folderGuildTarget('guild-middle', false);
		for (const y of [rect.top, 127, rect.bottom]) {
			expect(selectGuildReorderIntent(source, target, point(y), rect)).toMatchObject({
				indicator: 'top',
				result: {
					targetId: 'guild-middle',
					position: 'before',
					targetIsFolder: false,
					targetFolderId: 1,
				},
			});
		}
	});

	it('allows the terminal guild inside a folder to own the final after slot', () => {
		const source = guildItem('guild-source', 1);
		const target = folderGuildTarget('guild-last', true);
		expect(selectGuildReorderIntent(source, target, point(101), rect)).toMatchObject({
			indicator: 'top',
			result: {
				targetId: 'guild-last',
				position: 'before',
				targetFolderId: 1,
			},
		});
		expect(selectGuildReorderIntent(source, target, point(153), rect)).toMatchObject({
			indicator: 'bottom',
			result: {
				targetId: 'guild-last',
				position: 'after',
				targetFolderId: 1,
			},
		});
	});

	it('blocks dragging a folder onto a guild inside another folder', () => {
		const source = folderItem('folder-2', 2);
		const target = folderGuildTarget('guild-inside-folder', true);
		expect(canGuildDropOnTarget(source, target)).toBe(false);
		expect(resolveGuildReorderHover(source, target, point(127), rect)).toEqual({
			intent: null,
			blockedReason: 'folder-into-folder-guild',
		});
	});

	it('uses top edge for reordering before a folder and the rest of a folder target for adding a guild inside', () => {
		const source = guildItem('guild-source');
		const target = folderTarget('folder-1');
		expect(selectGuildReorderIntent(source, target, point(101), rect)).toMatchObject({
			indicator: 'top',
			result: {
				targetId: 'folder-1',
				position: 'before',
				targetIsFolder: true,
			},
		});
		expect(selectGuildReorderIntent(source, target, point(127), rect)).toMatchObject({
			indicator: 'inside',
			result: {
				targetId: 'folder-1',
				position: 'inside',
				targetIsFolder: true,
			},
		});
		expect(selectGuildReorderIntent(source, target, point(153), rect)).toMatchObject({
			indicator: 'inside',
			result: {
				targetId: 'folder-1',
				position: 'inside',
				targetIsFolder: true,
			},
		});
	});

	it('only reorders before a folder when dragging another folder', () => {
		const source = folderItem('folder-2', 2);
		const target = folderTarget('folder-1');
		for (const y of [rect.top, 127, rect.bottom]) {
			expect(selectGuildReorderIntent(source, target, point(y), rect)).toMatchObject({
				indicator: 'top',
				result: {
					targetId: 'folder-1',
					position: 'before',
					targetIsFolder: true,
				},
			});
		}
	});

	it('blocks zero-height target rects instead of producing a void result', () => {
		const emptyRect = {...rect, bottom: rect.top};
		expect(resolveGuildReorderHover(guildItem('guild-source'), rootGuildTarget(), point(rect.top), emptyRect)).toEqual({
			intent: null,
			blockedReason: 'empty-target-rect',
		});
	});
});
