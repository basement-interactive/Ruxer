// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0
import {describe, expect, it} from 'vitest';
import {selectPublisherCodecPreferences} from './RTCEngine.ts';

function codec(
	mimeType: string,
	sdpFmtpLine?: string,
): RTCRtpCapabilities['codecs'][number] & {
	sdpFmtpLine?: string;
} {
	return {
		mimeType,
		clockRate: 90000,
		...(sdpFmtpLine ? {sdpFmtpLine} : {}),
	};
}

describe('selectPublisherCodecPreferences', () => {
	it('prefers H.264 profiles that use Chromium external encoders before OpenH264', () => {
		const openH264 = codec('video/H264', 'level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f');
		const externalBaseline = codec(
			'video/H264',
			'level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42001f',
		);
		const highProfile = codec('video/H264', 'level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=64001f');
		const rtx = codec('video/rtx');
		const preferences = selectPublisherCodecPreferences('h264', [openH264, rtx, externalBaseline, highProfile]);
		expect(preferences).toEqual([externalBaseline, highProfile, openH264, rtx]);
	});

	it('keeps non-H.264 codecs in browser capability order and appends RTX', () => {
		const vp9 = codec('video/VP9');
		const vp8 = codec('video/VP8');
		const rtx = codec('video/rtx');
		expect(selectPublisherCodecPreferences('vp9', [vp8, rtx, vp9])).toEqual([vp9, rtx]);
	});
});
