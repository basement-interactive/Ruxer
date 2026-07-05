// SPDX-License-Identifier: AGPL-3.0-or-later

import {describe, expect, it} from 'vitest';
import {buildScreenShareOptions, resolveStreamingModeSettings} from './ScreenShareOptions';

describe('buildScreenShareOptions', () => {
	it('asks display capture to omit the cursor for app windows', () => {
		const {captureOptions} = buildScreenShareOptions({
			resolution: 'medium',
			frameRate: 30,
			includeAudio: false,
			preferredDisplaySurface: 'window',
		});
		expect(captureOptions.video).toMatchObject({cursor: 'never'});
	});
	it('asks display capture to include the cursor for full displays', () => {
		const {captureOptions} = buildScreenShareOptions({
			resolution: 'medium',
			frameRate: 30,
			includeAudio: false,
			preferredDisplaySurface: 'monitor',
		});
		expect(captureOptions.video).toMatchObject({
			cursor: 'always',
			displaySurface: 'monitor',
		});
	});
	it('preserves the preferred app display surface while omitting the cursor', () => {
		const {captureOptions} = buildScreenShareOptions({
			resolution: 'medium',
			frameRate: 30,
			includeAudio: true,
			preferredDisplaySurface: 'window',
		});
		expect(captureOptions.video).toMatchObject({
			cursor: 'never',
			displaySurface: 'window',
		});
	});
	it('requests own-audio restriction without offering monitor system audio for app window shares', () => {
		const {captureOptions} = buildScreenShareOptions({
			resolution: 'medium',
			frameRate: 30,
			includeAudio: true,
			preferredDisplaySurface: 'window',
		});
		expect(captureOptions).toMatchObject({
			audio: true,
			restrictOwnAudio: true,
			systemAudio: 'exclude',
			windowAudio: 'window',
			monitorTypeSurfaces: 'exclude',
		});
	});
	it('does not offer system audio for full display shares', () => {
		const {captureOptions} = buildScreenShareOptions({
			resolution: 'medium',
			frameRate: 30,
			includeAudio: true,
			preferredDisplaySurface: 'monitor',
		});
		expect(captureOptions).toMatchObject({
			audio: true,
			restrictOwnAudio: true,
			systemAudio: 'exclude',
			windowAudio: 'window',
			monitorTypeSurfaces: 'include',
		});
	});
	it('excludes window and system audio hints when audio is disabled', () => {
		const {captureOptions} = buildScreenShareOptions({
			resolution: 'medium',
			frameRate: 30,
			includeAudio: false,
		});
		expect(captureOptions).toMatchObject({
			audio: false,
			systemAudio: 'exclude',
			windowAudio: 'exclude',
		});
	});
	it('prefers framerate for detail-oriented shares', () => {
		const {publishOptions} = buildScreenShareOptions({
			resolution: 'medium',
			frameRate: 30,
			includeAudio: true,
		});
		expect(publishOptions.degradationPreference).toBe('maintain-framerate');
	});
	it('prefers framerate for non-gaming high-framerate shares', () => {
		const {publishOptions} = buildScreenShareOptions({
			resolution: 'ultra',
			frameRate: 60,
			includeAudio: true,
			streamingMode: 'screenshare',
		});
		expect(publishOptions.degradationPreference).toBe('maintain-framerate');
	});
	it('prefers framerate degradation for gaming streams', () => {
		const {publishOptions} = buildScreenShareOptions({
			resolution: 'ultra',
			frameRate: 60,
			includeAudio: true,
			streamingMode: 'gaming',
		});
		expect(publishOptions.degradationPreference).toBe('maintain-framerate');
	});
	it('passes the selected content hint through capture options', () => {
		const {captureOptions} = buildScreenShareOptions({
			resolution: 'medium',
			frameRate: 30,
			includeAudio: false,
			contentHint: 'motion',
		});
		expect(captureOptions.contentHint).toBe('motion');
	});
	it('leaves screen share content hint unset by default', () => {
		const {captureOptions} = buildScreenShareOptions({
			resolution: 'medium',
			frameRate: 30,
			includeAudio: false,
		});
		expect(captureOptions.contentHint).toBeUndefined();
	});
	it('uses a caller supplied bitrate ceiling', () => {
		const {publishOptions} = buildScreenShareOptions({
			resolution: 'source',
			frameRate: 60,
			includeAudio: false,
			maxBitrateBps: 50000000,
		});
		expect(publishOptions.screenShareEncoding?.maxBitrate).toBe(50000000);
	});
	it('lets the preset ladder exceed the old 10 Mbps default cap', () => {
		const {publishOptions} = buildScreenShareOptions({
			resolution: 'ultra',
			frameRate: 60,
			includeAudio: false,
		});
		expect(publishOptions.screenShareEncoding?.maxBitrate).toBe(24000000);
	});
	it('defaults the high-tier gaming preset to 60 fps', () => {
		expect(resolveStreamingModeSettings('gaming', 'medium', 30, true)).toEqual({
			resolution: 'ultra',
			frameRate: 60,
		});
	});
	it('keeps free-tier gaming capped at 30 fps', () => {
		expect(resolveStreamingModeSettings('gaming', 'medium', 30, false)).toEqual({
			resolution: 'medium',
			frameRate: 30,
		});
	});
});
