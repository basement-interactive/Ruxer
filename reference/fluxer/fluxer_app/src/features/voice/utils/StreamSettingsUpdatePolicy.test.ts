// SPDX-License-Identifier: AGPL-3.0-or-later

import {describe, expect, it} from 'vitest';
import {
	isLinuxDesktopAudioShare,
	shouldReconfigureLinuxAudioForActiveStreamSettings,
} from './StreamSettingsUpdatePolicy';

describe('StreamSettingsUpdatePolicy', () => {
	it('recognizes Linux app and display streams as desktop-audio shares', () => {
		expect(isLinuxDesktopAudioShare({platform: 'linux', shareContext: 'display'})).toBe(true);
		expect(isLinuxDesktopAudioShare({platform: 'linux', shareContext: 'app'})).toBe(true);
		expect(isLinuxDesktopAudioShare({platform: 'linux', shareContext: 'device'})).toBe(false);
		expect(isLinuxDesktopAudioShare({platform: 'win32', shareContext: 'display'})).toBe(false);
	});
	it('does not reconfigure Linux audio for video-only stream settings', () => {
		expect(
			shouldReconfigureLinuxAudioForActiveStreamSettings({
				platform: 'linux',
				shareContext: 'display',
				audioSettingsChanged: false,
			}),
		).toBe(false);
	});
	it('reconfigures Linux audio only when an audio setting changed', () => {
		expect(
			shouldReconfigureLinuxAudioForActiveStreamSettings({
				platform: 'linux',
				shareContext: 'display',
				audioSettingsChanged: true,
			}),
		).toBe(true);
		expect(
			shouldReconfigureLinuxAudioForActiveStreamSettings({
				platform: 'linux',
				shareContext: 'device',
				audioSettingsChanged: true,
			}),
		).toBe(false);
	});
});
