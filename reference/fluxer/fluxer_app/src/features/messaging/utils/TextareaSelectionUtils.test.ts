// SPDX-License-Identifier: AGPL-3.0-or-later

// @vitest-environment happy-dom

import {
	normalizeTextareaSelectionSnapshot,
	restoreTextareaSelection,
	type TextareaSelectionSnapshot,
} from '@app/features/messaging/utils/TextareaSelectionUtils';
import {describe, expect, it} from 'vitest';

describe('TextareaSelectionUtils', () => {
	it('clamps saved selections to the current textarea value', () => {
		const snapshot: TextareaSelectionSnapshot = {
			selectionStart: 10,
			selectionEnd: 12,
			selectionDirection: 'backward',
		};

		expect(normalizeTextareaSelectionSnapshot(snapshot, 5)).toEqual({
			selectionStart: 5,
			selectionEnd: 5,
			selectionDirection: 'backward',
		});
	});

	it('restores selection direction when applying a snapshot', () => {
		const textarea = document.createElement('textarea');
		textarea.value = 'hello world';
		document.body.append(textarea);

		restoreTextareaSelection(textarea, {
			selectionStart: 2,
			selectionEnd: 7,
			selectionDirection: 'backward',
		});

		expect(textarea.selectionStart).toBe(2);
		expect(textarea.selectionEnd).toBe(7);
		expect(textarea.selectionDirection).toBe('backward');

		textarea.remove();
	});
});
