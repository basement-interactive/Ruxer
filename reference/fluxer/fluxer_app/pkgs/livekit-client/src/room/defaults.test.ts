// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0
import {describe, expect, it} from 'vitest';
import {defaultVideoCodec, publishDefaults, roomOptionDefaults} from './defaults.ts';
import {BackupCodecPolicy} from './track/options.ts';

describe('Fluxer media publish defaults', () => {
	it('defaults new video publishes to the advanced codec path with H.264 backup', () => {
		expect(defaultVideoCodec).toBe('av1');
		expect(publishDefaults).toMatchObject({
			videoCodec: 'av1',
			backupCodec: {codec: 'h264'},
			backupCodecPolicy: BackupCodecPolicy.SIMULCAST,
			degradationPreference: 'maintain-resolution',
			dtx: false,
			red: true,
		});
	});

	it('keeps original screen-share publishing at a 4K60-ready transport ceiling', () => {
		expect(publishDefaults.screenShareEncoding).toMatchObject({
			maxBitrate: 20_000_000,
			maxFramerate: 60,
			priority: 'high',
		});
	});

	it('uses publisher-side stream control defaults for high-fidelity screen sharing', () => {
		expect(roomOptionDefaults).toMatchObject({
			adaptiveStream: false,
			dynacast: true,
			singlePeerConnection: true,
		});
	});
});
