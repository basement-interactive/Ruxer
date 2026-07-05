// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	createPoppedOutSurfaceSnapshot,
	isPoppedOutSurfaceTransitioning,
	type PoppedOutSurfacePhase,
	selectPoppedOutOverlayTransition,
	shouldRenderPoppedOutOverlay,
	transitionPoppedOutSurfaceSnapshot,
} from '@app/features/voice/components/popout/PoppedOutSurfaceStateMachine';
import {describe, expect, it} from 'vitest';

function snapshotWithPhase(phase: PoppedOutSurfacePhase) {
	return {phase};
}

describe('PoppedOutSurfaceStateMachine', () => {
	it('creates a live snapshot when not popped out', () => {
		expect(createPoppedOutSurfaceSnapshot(false)).toEqual({phase: 'live'});
	});

	it('creates a popped snapshot when already popped out', () => {
		expect(createPoppedOutSurfaceSnapshot(true)).toEqual({phase: 'popped'});
	});

	it('enters popping-out from live when the popout opens', () => {
		const next = transitionPoppedOutSurfaceSnapshot(snapshotWithPhase('live'), {
			type: 'popout.update',
			isPoppedOut: true,
		});
		expect(next.phase).toBe('popping-out');
	});

	it('settles into popped when the enter transition completes', () => {
		const next = transitionPoppedOutSurfaceSnapshot(snapshotWithPhase('popping-out'), {
			type: 'popout.transition-end',
		});
		expect(next.phase).toBe('popped');
	});

	it('enters restoring from popped when the popout closes', () => {
		const next = transitionPoppedOutSurfaceSnapshot(snapshotWithPhase('popped'), {
			type: 'popout.update',
			isPoppedOut: false,
		});
		expect(next.phase).toBe('restoring');
	});

	it('settles into live when the exit transition completes', () => {
		const next = transitionPoppedOutSurfaceSnapshot(snapshotWithPhase('restoring'), {
			type: 'popout.transition-end',
		});
		expect(next.phase).toBe('live');
	});

	it('reverses a restore in flight when the popout reopens', () => {
		const next = transitionPoppedOutSurfaceSnapshot(snapshotWithPhase('restoring'), {
			type: 'popout.update',
			isPoppedOut: true,
		});
		expect(next.phase).toBe('popping-out');
	});

	it('reverses a pop-out in flight when the popout closes early', () => {
		const next = transitionPoppedOutSurfaceSnapshot(snapshotWithPhase('popping-out'), {
			type: 'popout.update',
			isPoppedOut: false,
		});
		expect(next.phase).toBe('restoring');
	});

	it('keeps the same snapshot for redundant updates', () => {
		const live = snapshotWithPhase('live');
		expect(transitionPoppedOutSurfaceSnapshot(live, {type: 'popout.update', isPoppedOut: false})).toBe(live);
		const popped = snapshotWithPhase('popped');
		expect(transitionPoppedOutSurfaceSnapshot(popped, {type: 'popout.update', isPoppedOut: true})).toBe(popped);
	});

	it('ignores transition-end outside of transitional phases', () => {
		const live = snapshotWithPhase('live');
		expect(transitionPoppedOutSurfaceSnapshot(live, {type: 'popout.transition-end'})).toBe(live);
		const popped = snapshotWithPhase('popped');
		expect(transitionPoppedOutSurfaceSnapshot(popped, {type: 'popout.transition-end'})).toBe(popped);
	});

	it('renders the overlay in every phase except live', () => {
		expect(shouldRenderPoppedOutOverlay(snapshotWithPhase('live'))).toBe(false);
		expect(shouldRenderPoppedOutOverlay(snapshotWithPhase('popping-out'))).toBe(true);
		expect(shouldRenderPoppedOutOverlay(snapshotWithPhase('popped'))).toBe(true);
		expect(shouldRenderPoppedOutOverlay(snapshotWithPhase('restoring'))).toBe(true);
	});

	it('selects the overlay transition for each phase', () => {
		expect(selectPoppedOutOverlayTransition(snapshotWithPhase('popping-out'))).toBe('enter');
		expect(selectPoppedOutOverlayTransition(snapshotWithPhase('popped'))).toBe('static');
		expect(selectPoppedOutOverlayTransition(snapshotWithPhase('restoring'))).toBe('exit');
		expect(selectPoppedOutOverlayTransition(snapshotWithPhase('live'))).toBe('static');
	});

	it('reports transitioning only for popping-out and restoring', () => {
		expect(isPoppedOutSurfaceTransitioning(snapshotWithPhase('popping-out'))).toBe(true);
		expect(isPoppedOutSurfaceTransitioning(snapshotWithPhase('restoring'))).toBe(true);
		expect(isPoppedOutSurfaceTransitioning(snapshotWithPhase('live'))).toBe(false);
		expect(isPoppedOutSurfaceTransitioning(snapshotWithPhase('popped'))).toBe(false);
	});
});
