// SPDX-License-Identifier: AGPL-3.0-or-later

import {describe, expect, it} from 'vitest';
import {
	getScaledMediaDimensions,
	LOCAL_MEDIA_PREVIEW_MAX_BYTES,
	shouldEagerlyPreviewLocalImage,
	shouldEagerlyPreviewLocalVideo,
} from './LocalAttachmentPreviewUtils';

describe('Local attachment preview utils', () => {
	it('allows eager image previews at or below the local preview size cap', () => {
		expect(
			shouldEagerlyPreviewLocalImage({
				type: 'image/png',
				name: 'image.png',
				size: LOCAL_MEDIA_PREVIEW_MAX_BYTES,
			}),
		).toBe(true);
	});
	it('skips eager image and video previews above the local preview size cap', () => {
		const size = LOCAL_MEDIA_PREVIEW_MAX_BYTES + 1;
		expect(shouldEagerlyPreviewLocalImage({type: 'image/png', name: 'image.png', size})).toBe(false);
		expect(shouldEagerlyPreviewLocalVideo({type: 'video/mp4', name: 'video.mp4', size})).toBe(false);
	});
	it('scales video thumbnail dimensions to the configured maximum edge', () => {
		expect(getScaledMediaDimensions(3840, 2160, 640)).toEqual({width: 640, height: 360});
		expect(getScaledMediaDimensions(720, 1280, 640)).toEqual({width: 360, height: 640});
	});
	it('keeps small thumbnail dimensions unchanged', () => {
		expect(getScaledMediaDimensions(320, 240, 640)).toEqual({width: 320, height: 240});
	});
});
