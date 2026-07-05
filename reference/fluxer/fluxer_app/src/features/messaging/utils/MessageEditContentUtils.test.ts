// SPDX-License-Identifier: AGPL-3.0-or-later

import {describe, expect, it} from 'vitest';
import {buildExistingAttachmentEditReferences, canSubmitEmptyMessageEdit} from './MessageEditContentUtils';

describe('Message edit content utils', () => {
	it('keeps empty edits delete-oriented for messages without attachments', () => {
		expect(canSubmitEmptyMessageEdit({attachments: []})).toBe(false);
	});
	it('allows empty edits when existing attachments can keep the message non-empty', () => {
		expect(canSubmitEmptyMessageEdit({attachments: [{id: '123'}]})).toBe(true);
	});
	it('builds attachment references that retain existing attachments during an empty edit', () => {
		expect(buildExistingAttachmentEditReferences({attachments: [{id: '123'}, {id: '456'}]})).toEqual([
			{id: '123'},
			{id: '456'},
		]);
	});
});
