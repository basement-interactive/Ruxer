// SPDX-License-Identifier: AGPL-3.0-or-later

import {describe, expect, it} from 'vitest';
import {
	createScreenShareCodecPublicationSnapshot,
	selectScreenShareCodecRepublishDecision,
	transitionScreenShareCodecPublicationSnapshot,
} from './VoiceScreenShareCodecRepublishPolicy';

describe('selectScreenShareCodecRepublishDecision', () => {
	it('does not republish when the selected codec already matches the active sender', () => {
		expect(
			selectScreenShareCodecRepublishDecision({
				currentCodec: 'vp8',
				nextCodec: 'vp8',
				reason: 'data',
			}),
		).toEqual({action: 'noop', reason: 'same-codec'});
	});

	it('republishes automatic negotiation changes in-place while a share is already live', () => {
		for (const reason of ['participant-connected', 'data', 'connected', 'reconnected'] as const) {
			expect(
				selectScreenShareCodecRepublishDecision({
					currentCodec: 'vp8',
					nextCodec: 'h264',
					reason,
				}),
			).toEqual({action: 'republish', reason: 'automatic'});
		}
	});

	it('republishes manual and forced live changes by default', () => {
		expect(
			selectScreenShareCodecRepublishDecision({
				currentCodec: 'vp8',
				nextCodec: 'h264',
				reason: 'manual',
			}),
		).toEqual({action: 'republish', reason: 'manual'});
		expect(
			selectScreenShareCodecRepublishDecision({
				currentCodec: 'vp8',
				nextCodec: 'h264',
				reason: 'participant-connected',
				force: true,
			}),
		).toEqual({action: 'republish', reason: 'forced'});
	});

	it('keeps the XState snapshot in republishing state for repeated live codec changes', () => {
		let snapshot = createScreenShareCodecPublicationSnapshot();
		snapshot = transitionScreenShareCodecPublicationSnapshot(snapshot, {
			type: 'codec.selection',
			currentCodec: 'h265',
			nextCodec: 'h264',
			reason: 'participant-connected',
		});
		expect(snapshot.value).toBe('republishing');
		expect(snapshot.context.decision).toEqual({action: 'republish', reason: 'automatic'});
		snapshot = transitionScreenShareCodecPublicationSnapshot(snapshot, {
			type: 'codec.selection',
			currentCodec: 'h265',
			nextCodec: 'vp8',
			reason: 'data',
		});
		expect(snapshot.value).toBe('republishing');
		expect(snapshot.context.nextCodec).toBe('vp8');
	});

	it('retains an explicit switch to defer live republishing', () => {
		expect(
			selectScreenShareCodecRepublishDecision({
				currentCodec: 'vp8',
				nextCodec: 'h264',
				reason: 'participant-connected',
				allowLiveRepublish: false,
			}),
		).toEqual({action: 'defer', reason: 'active-share-stability'});
		expect(
			selectScreenShareCodecRepublishDecision({
				currentCodec: 'vp8',
				nextCodec: 'h264',
				reason: 'participant-connected',
				force: true,
				allowLiveRepublish: false,
			}),
		).toEqual({action: 'defer', reason: 'live-republish-disabled'});
	});

	it('keeps explicit live republish decisions stable', () => {
		expect(
			selectScreenShareCodecRepublishDecision({
				currentCodec: 'vp8',
				nextCodec: 'h264',
				reason: 'participant-connected',
				force: true,
				allowLiveRepublish: true,
			}),
		).toEqual({action: 'republish', reason: 'forced'});
		expect(
			selectScreenShareCodecRepublishDecision({
				currentCodec: 'vp8',
				nextCodec: 'h264',
				reason: 'manual',
				allowLiveRepublish: true,
			}),
		).toEqual({action: 'republish', reason: 'manual'});
	});

	it('republishes a downgrade when a weaker client joins mid-share', () => {
		expect(
			selectScreenShareCodecRepublishDecision({
				currentCodec: 'av1',
				nextCodec: 'h264',
				reason: 'participant-connected',
				allowLiveRepublish: true,
			}),
		).toEqual({action: 'republish', reason: 'automatic'});
	});

	it('republishes an upgrade when the constraining client leaves', () => {
		expect(
			selectScreenShareCodecRepublishDecision({
				currentCodec: 'h264',
				nextCodec: 'av1',
				reason: 'participant-disconnected',
				allowLiveRepublish: true,
			}),
		).toEqual({action: 'republish', reason: 'automatic'});
	});

	it('republishes an upgrade when a late advertisement improves the intersection', () => {
		expect(
			selectScreenShareCodecRepublishDecision({
				currentCodec: 'vp8',
				nextCodec: 'av1',
				reason: 'data',
				allowLiveRepublish: true,
			}),
		).toEqual({action: 'republish', reason: 'automatic'});
	});

	it('does not republish unchanged selections under repeated evaluations', () => {
		let snapshot = createScreenShareCodecPublicationSnapshot();
		for (let i = 0; i < 3; i++) {
			snapshot = transitionScreenShareCodecPublicationSnapshot(snapshot, {
				type: 'codec.selection',
				currentCodec: 'av1',
				nextCodec: 'av1',
				reason: 'data',
				allowLiveRepublish: true,
			});
			expect(snapshot.value).toBe('stable');
			expect(snapshot.context.decision).toEqual({action: 'noop', reason: 'same-codec'});
		}
	});

	it('honours explicit user preference changes in both directions', () => {
		expect(
			selectScreenShareCodecRepublishDecision({
				currentCodec: 'av1',
				nextCodec: 'vp8',
				reason: 'manual',
				allowLiveRepublish: true,
			}),
		).toEqual({action: 'republish', reason: 'manual'});
		expect(
			selectScreenShareCodecRepublishDecision({
				currentCodec: 'vp8',
				nextCodec: 'av1',
				reason: 'manual',
				allowLiveRepublish: true,
			}),
		).toEqual({action: 'republish', reason: 'manual'});
	});

	it('walks the state machine through downgrade, stability, and upgrade transitions', () => {
		let snapshot = createScreenShareCodecPublicationSnapshot();
		expect(snapshot.value).toBe('stable');
		snapshot = transitionScreenShareCodecPublicationSnapshot(snapshot, {
			type: 'codec.selection',
			currentCodec: 'av1',
			nextCodec: 'h264',
			reason: 'participant-connected',
			allowLiveRepublish: true,
		});
		expect(snapshot.value).toBe('republishing');
		expect(snapshot.context.decision).toEqual({action: 'republish', reason: 'automatic'});
		snapshot = transitionScreenShareCodecPublicationSnapshot(snapshot, {
			type: 'codec.selection',
			currentCodec: 'h264',
			nextCodec: 'h264',
			reason: 'data',
			allowLiveRepublish: true,
		});
		expect(snapshot.value).toBe('stable');
		expect(snapshot.context.decision).toEqual({action: 'noop', reason: 'same-codec'});
		snapshot = transitionScreenShareCodecPublicationSnapshot(snapshot, {
			type: 'codec.selection',
			currentCodec: 'h264',
			nextCodec: 'av1',
			reason: 'participant-disconnected',
			allowLiveRepublish: true,
		});
		expect(snapshot.value).toBe('republishing');
		expect(snapshot.context.decision).toEqual({action: 'republish', reason: 'automatic'});
		expect(snapshot.context.nextCodec).toBe('av1');
	});

	it('moves deferred selections into republishing once live republish is allowed again', () => {
		let snapshot = createScreenShareCodecPublicationSnapshot();
		snapshot = transitionScreenShareCodecPublicationSnapshot(snapshot, {
			type: 'codec.selection',
			currentCodec: 'av1',
			nextCodec: 'h264',
			reason: 'participant-connected',
			allowLiveRepublish: false,
		});
		expect(snapshot.value).toBe('deferred');
		expect(snapshot.context.decision).toEqual({action: 'defer', reason: 'active-share-stability'});
		snapshot = transitionScreenShareCodecPublicationSnapshot(snapshot, {
			type: 'codec.selection',
			currentCodec: 'av1',
			nextCodec: 'h264',
			reason: 'data',
			allowLiveRepublish: true,
		});
		expect(snapshot.value).toBe('republishing');
		expect(snapshot.context.decision).toEqual({action: 'republish', reason: 'automatic'});
	});
});
