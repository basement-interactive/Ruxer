// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	getUploadUrlExpiresAtMs,
	isUploadUrlFresh,
	STREAM_PREVIEW_UPLOAD_URL_REFRESH_SKEW_MS,
	StreamPreviewUploadScheduler,
} from '@app/features/voice/components/voice_participant_tile/StreamPreviewUploadPolicy';
import {
	STREAM_PREVIEW_INITIAL_UPLOAD_INTERVAL_MS,
	STREAM_PREVIEW_INITIAL_UPLOAD_MAX_ATTEMPTS,
	STREAM_PREVIEW_UPLOAD_INTERVAL_MS,
} from '@fluxer/constants/src/StreamConstants';
import {describe, expect, it} from 'vitest';

const STREAM_KEY = 'guild-1:channel-1:connection-1';

function makeScheduler(): StreamPreviewUploadScheduler {
	return new StreamPreviewUploadScheduler(() => 0.5);
}

describe('StreamPreviewUploadScheduler', () => {
	it('uploads at the fast bootstrap interval before the first upload completes', () => {
		const scheduler = makeScheduler();
		const decision = scheduler.decide({
			now: 0,
			hasUploadedOnce: false,
			initialAttempts: 0,
			hasSpectatorDemand: false,
			previewsDisabled: false,
		});
		expect(decision).toEqual({action: 'upload', nextDelayMs: STREAM_PREVIEW_INITIAL_UPLOAD_INTERVAL_MS});
	});

	it('switches to the steady cadence once bootstrap has uploaded and demand exists', () => {
		const scheduler = makeScheduler();
		const decision = scheduler.decide({
			now: 0,
			hasUploadedOnce: true,
			initialAttempts: 1,
			hasSpectatorDemand: true,
			previewsDisabled: false,
		});
		expect(decision).toEqual({action: 'upload', nextDelayMs: STREAM_PREVIEW_UPLOAD_INTERVAL_MS});
	});

	it('idles without uploading after bootstrap when there is no spectator demand', () => {
		const scheduler = makeScheduler();
		const decision = scheduler.decide({
			now: 0,
			hasUploadedOnce: true,
			initialAttempts: 1,
			hasSpectatorDemand: false,
			previewsDisabled: false,
		});
		expect(decision.action).toBe('wait');
		expect(decision.nextDelayMs).toBeGreaterThan(0);
	});

	it('keeps the bootstrap uploads unconditional even without demand', () => {
		const scheduler = makeScheduler();
		const decision = scheduler.decide({
			now: 0,
			hasUploadedOnce: false,
			initialAttempts: STREAM_PREVIEW_INITIAL_UPLOAD_MAX_ATTEMPTS - 1,
			hasSpectatorDemand: false,
			previewsDisabled: false,
		});
		expect(decision.action).toBe('upload');
	});

	it('stops treating the session as bootstrap after the attempt cap is reached', () => {
		const scheduler = makeScheduler();
		const decision = scheduler.decide({
			now: 0,
			hasUploadedOnce: false,
			initialAttempts: STREAM_PREVIEW_INITIAL_UPLOAD_MAX_ATTEMPTS,
			hasSpectatorDemand: false,
			previewsDisabled: false,
		});
		expect(decision.action).toBe('wait');
	});

	it('waits while previews are disabled regardless of bootstrap or demand', () => {
		const scheduler = makeScheduler();
		const decision = scheduler.decide({
			now: 0,
			hasUploadedOnce: false,
			initialAttempts: 0,
			hasSpectatorDemand: true,
			previewsDisabled: true,
		});
		expect(decision.action).toBe('wait');
	});
});

describe('isUploadUrlFresh', () => {
	it('treats a ticket as fresh until the refresh skew window before expiry', () => {
		const now = 1_000_000;
		const entry = {streamKey: STREAM_KEY, expiresAtMs: now + STREAM_PREVIEW_UPLOAD_URL_REFRESH_SKEW_MS + 1};
		expect(isUploadUrlFresh(entry, STREAM_KEY, now)).toBe(true);
	});

	it('flips to stale exactly at the expiry minus skew boundary', () => {
		const now = 1_000_000;
		const entry = {streamKey: STREAM_KEY, expiresAtMs: now + STREAM_PREVIEW_UPLOAD_URL_REFRESH_SKEW_MS};
		expect(isUploadUrlFresh(entry, STREAM_KEY, now)).toBe(false);
	});

	it('rejects a ticket minted for a different stream key', () => {
		const now = 1_000_000;
		const entry = {streamKey: 'other', expiresAtMs: now + STREAM_PREVIEW_UPLOAD_URL_REFRESH_SKEW_MS + 10_000};
		expect(isUploadUrlFresh(entry, STREAM_KEY, now)).toBe(false);
	});

	it('rejects a null ticket', () => {
		expect(isUploadUrlFresh(null, STREAM_KEY, 0)).toBe(false);
	});
});

describe('getUploadUrlExpiresAtMs', () => {
	it('prefers the absolute expires_at timestamp when parseable', () => {
		const expiresAt = new Date('2026-01-01T00:10:00.000Z').toISOString();
		expect(getUploadUrlExpiresAtMs({expires_at: expiresAt, expires_in: 600}, 0)).toBe(Date.parse(expiresAt));
	});

	it('falls back to now plus expires_in when expires_at is unparseable', () => {
		const now = 5_000;
		expect(getUploadUrlExpiresAtMs({expires_at: 'not-a-date', expires_in: 600}, now)).toBe(now + 600_000);
	});
});
