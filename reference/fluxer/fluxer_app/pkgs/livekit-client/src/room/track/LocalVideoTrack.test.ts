// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0
import {describe, expect, it} from 'vitest';
import {videoLayersFromEncodings} from './LocalVideoTrack.ts';

describe('videoLayersFromEncodings', () => {
	it('treats SVC codecs without a configured scalability mode as a single layer', () => {
		const layers = videoLayersFromEncodings(1920, 1080, [{maxBitrate: 12_000_000}], true);
		expect(layers).toHaveLength(1);
		expect(layers[0]).toMatchObject({
			width: 1920,
			height: 1080,
			bitrate: 12_000_000,
		});
	});
});
