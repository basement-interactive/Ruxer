// SPDX-License-Identifier: AGPL-3.0-or-later

import {describe, expect, it} from 'vitest';
import {
	computeVoiceEngineV2NativeParticipantVolume,
	VOICE_ENGINE_V2_VOLUME_MAX_PERCENT,
} from './nativeParticipantVolume';

const USER_VOLUME_PERCENTS = [0, 25, 50, 100, 150, VOICE_ENGINE_V2_VOLUME_MAX_PERCENT];

describe('computeVoiceEngineV2NativeParticipantVolume deafen handling', () => {
	it.each(USER_VOLUME_PERCENTS)('forces volume 0 when effectiveDeaf regardless of user volume %d', (percent) => {
		const volume = computeVoiceEngineV2NativeParticipantVolume({
			userVolumePercent: percent,
			outputVolumePercent: 100,
			locallyMuted: false,
			effectiveDeaf: true,
		});
		expect(volume).toBe(0);
	});

	it('forces volume 0 when effectiveDeaf and locallyMuted', () => {
		const volume = computeVoiceEngineV2NativeParticipantVolume({
			userVolumePercent: 100,
			outputVolumePercent: 100,
			locallyMuted: true,
			effectiveDeaf: true,
		});
		expect(volume).toBe(0);
	});

	it('forces volume 0 when effectiveDeaf with boosted output volume', () => {
		const volume = computeVoiceEngineV2NativeParticipantVolume({
			userVolumePercent: VOICE_ENGINE_V2_VOLUME_MAX_PERCENT,
			outputVolumePercent: VOICE_ENGINE_V2_VOLUME_MAX_PERCENT,
			locallyMuted: false,
			effectiveDeaf: true,
		});
		expect(volume).toBe(0);
	});

	it('returns 0 when locallyMuted and not deafened', () => {
		const volume = computeVoiceEngineV2NativeParticipantVolume({
			userVolumePercent: 100,
			outputVolumePercent: 100,
			locallyMuted: true,
			effectiveDeaf: false,
		});
		expect(volume).toBe(0);
	});

	it('returns unity gain at 100/100 when not deafened and not muted', () => {
		const volume = computeVoiceEngineV2NativeParticipantVolume({
			userVolumePercent: 100,
			outputVolumePercent: 100,
			locallyMuted: false,
			effectiveDeaf: false,
		});
		expect(volume).toBeCloseTo(1, 5);
	});

	it('treats omitted effectiveDeaf as not deafened', () => {
		const volume = computeVoiceEngineV2NativeParticipantVolume({
			userVolumePercent: 100,
			outputVolumePercent: 100,
			locallyMuted: false,
		});
		expect(volume).toBeCloseTo(1, 5);
	});

	it.each(USER_VOLUME_PERCENTS)('stays within [0, 2] when undeafened at user volume %d', (percent) => {
		const volume = computeVoiceEngineV2NativeParticipantVolume({
			userVolumePercent: percent,
			outputVolumePercent: VOICE_ENGINE_V2_VOLUME_MAX_PERCENT,
			locallyMuted: false,
			effectiveDeaf: false,
		});
		expect(volume).toBeGreaterThanOrEqual(0);
		expect(volume).toBeLessThanOrEqual(2);
	});

	it('restores a positive volume after undeafen for an audible participant', () => {
		const deafened = computeVoiceEngineV2NativeParticipantVolume({
			userVolumePercent: 150,
			outputVolumePercent: 100,
			locallyMuted: false,
			effectiveDeaf: true,
		});
		const restored = computeVoiceEngineV2NativeParticipantVolume({
			userVolumePercent: 150,
			outputVolumePercent: 100,
			locallyMuted: false,
			effectiveDeaf: false,
		});
		expect(deafened).toBe(0);
		expect(restored).toBeGreaterThan(1);
	});

	it('forces volume 0 when streamMuted regardless of stream volume', () => {
		const volume = computeVoiceEngineV2NativeParticipantVolume({
			userVolumePercent: 100,
			outputVolumePercent: 100,
			locallyMuted: false,
			effectiveDeaf: false,
			streamVolumePercent: 100,
			streamMuted: true,
		});
		expect(volume).toBe(0);
	});

	it('returns 0 when stream volume is 0', () => {
		const volume = computeVoiceEngineV2NativeParticipantVolume({
			userVolumePercent: 100,
			outputVolumePercent: 100,
			locallyMuted: false,
			effectiveDeaf: false,
			streamVolumePercent: 0,
		});
		expect(volume).toBe(0);
	});

	it('composes a reduced stream volume below unity gain', () => {
		const volume = computeVoiceEngineV2NativeParticipantVolume({
			userVolumePercent: 100,
			outputVolumePercent: 100,
			locallyMuted: false,
			effectiveDeaf: false,
			streamVolumePercent: 50,
		});
		expect(volume).toBeGreaterThan(0);
		expect(volume).toBeLessThan(1);
	});

	it('treats omitted stream inputs as full stream volume', () => {
		const withStream = computeVoiceEngineV2NativeParticipantVolume({
			userVolumePercent: 100,
			outputVolumePercent: 100,
			locallyMuted: false,
			effectiveDeaf: false,
			streamVolumePercent: 100,
			streamMuted: false,
		});
		const withoutStream = computeVoiceEngineV2NativeParticipantVolume({
			userVolumePercent: 100,
			outputVolumePercent: 100,
			locallyMuted: false,
			effectiveDeaf: false,
		});
		expect(withStream).toBeCloseTo(withoutStream, 5);
	});

	it('forces volume 0 when deafened even if stream is unmuted at full volume', () => {
		const volume = computeVoiceEngineV2NativeParticipantVolume({
			userVolumePercent: 100,
			outputVolumePercent: 100,
			locallyMuted: false,
			effectiveDeaf: true,
			streamVolumePercent: 100,
			streamMuted: false,
		});
		expect(volume).toBe(0);
	});

	it('throws on non-boolean streamMuted', () => {
		expect(() =>
			computeVoiceEngineV2NativeParticipantVolume({
				userVolumePercent: 100,
				outputVolumePercent: 100,
				locallyMuted: false,
				streamMuted: 'no' as unknown as boolean,
			}),
		).toThrow();
	});

	it('throws on non-boolean locallyMuted', () => {
		expect(() =>
			computeVoiceEngineV2NativeParticipantVolume({
				userVolumePercent: 100,
				outputVolumePercent: 100,
				locallyMuted: 'yes' as unknown as boolean,
			}),
		).toThrow();
	});

	it('throws on non-boolean effectiveDeaf', () => {
		expect(() =>
			computeVoiceEngineV2NativeParticipantVolume({
				userVolumePercent: 100,
				outputVolumePercent: 100,
				locallyMuted: false,
				effectiveDeaf: 1 as unknown as boolean,
			}),
		).toThrow();
	});
});
