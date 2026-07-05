// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	createClipboardImageFile,
	getClipboardDataFiles,
	readClipboardImageFiles,
} from '@app/features/messaging/utils/ClipboardFilePasteUtils';
import {describe, expect, it} from 'vitest';

function fileList(files: Array<File>): FileList {
	return Object.assign([...files], {
		item: (index: number) => files[index] ?? null,
	}) as unknown as FileList;
}

describe('ClipboardFilePasteUtils', () => {
	it('extracts usable files from paste event clipboard data', () => {
		const image = new File(['image'], 'photo.png', {type: 'image/png'});
		const emptyAnonymousFile = new File([], '', {type: ''});
		const clipboardData = {files: fileList([image, emptyAnonymousFile])} as DataTransfer;

		expect(getClipboardDataFiles(clipboardData)).toEqual([image]);
	});

	it('creates named files for async clipboard image blobs', () => {
		const file = createClipboardImageFile(new Blob(['image'], {type: 'image/webp'}), 1, 'image/webp');

		expect(file.name).toBe('clipboard-image-2.webp');
		expect(file.type).toBe('image/webp');
		expect(file.size).toBe(5);
	});

	it('reads image blobs from the async clipboard and ignores non-image data', async () => {
		const pngBlob = new Blob(['png'], {type: 'image/png'});
		const clipboard = {
			read: async () => [
				{
					types: ['text/plain'],
					getType: async () => new Blob(['text'], {type: 'text/plain'}),
				},
				{
					types: ['image/png', 'image/jpeg'],
					getType: async (type: string) => (type === 'image/png' ? pngBlob : new Blob([], {type})),
				},
			],
		};

		const files = await readClipboardImageFiles(clipboard);

		expect(files).toHaveLength(1);
		expect(files[0]?.name).toBe('clipboard-image-1.png');
		expect(files[0]?.type).toBe('image/png');
		expect(files[0]?.size).toBe(3);
	});
});
