// SPDX-License-Identifier: AGPL-3.0-or-later

import {describe, expect, test} from 'vitest';
import {entranceSoundExtensionFromFormat, entranceSoundExtensionFromMime} from './EntranceSoundConstants';

describe('entrance sound format detection', () => {
	test('accepts wav metadata produced by the in-app trimmer', () => {
		expect(entranceSoundExtensionFromFormat('wav')).toBe('wav');
		expect(entranceSoundExtensionFromMime('audio/wav')).toBe('wav');
	});

	test('accepts common ffprobe compound format names', () => {
		expect(entranceSoundExtensionFromFormat('mp3,mp2,mp1')).toBe('mp3');
		expect(entranceSoundExtensionFromFormat('mov,mp4,m4a,3gp,3g2,mj2')).toBe('m4a');
	});
});
