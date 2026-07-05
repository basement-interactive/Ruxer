// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	createMentionConfirmationSnapshot,
	type MentionConfirmationInfo,
	selectMentionConfirmationModel,
	transitionMentionConfirmationSnapshot,
} from '@app/features/messaging/state/MentionConfirmationStateMachine';
import {describe, expect, it} from 'vitest';

function confirmation(overrides: Partial<MentionConfirmationInfo> = {}): MentionConfirmationInfo {
	return {
		mentionType: '@everyone',
		memberCount: 80,
		content: '@everyone hello',
		sourceContent: '@everyone hello',
		...overrides,
	};
}

describe('MentionConfirmationStateMachine', () => {
	it('shows a current confirmation request', () => {
		const info = confirmation();
		const snapshot = transitionMentionConfirmationSnapshot(createMentionConfirmationSnapshot(), {
			type: 'mentionConfirmation.requested',
			info,
			currentSourceContent: info.sourceContent,
		});

		expect(selectMentionConfirmationModel(snapshot)).toEqual({
			visible: true,
			pending: info,
		});
	});

	it('ignores a stale confirmation request after the composer changed', () => {
		const info = confirmation();
		const snapshot = transitionMentionConfirmationSnapshot(createMentionConfirmationSnapshot(), {
			type: 'mentionConfirmation.requested',
			info,
			currentSourceContent: 'edited text',
		});

		expect(selectMentionConfirmationModel(snapshot)).toEqual({
			visible: false,
			pending: null,
		});
	});

	it('dismisses the visible warning when the composer source changes', () => {
		const info = confirmation();
		let snapshot = transitionMentionConfirmationSnapshot(createMentionConfirmationSnapshot(), {
			type: 'mentionConfirmation.requested',
			info,
			currentSourceContent: info.sourceContent,
		});

		snapshot = transitionMentionConfirmationSnapshot(snapshot, {
			type: 'mentionConfirmation.composerChanged',
			sourceContent: '',
		});

		expect(selectMentionConfirmationModel(snapshot)).toEqual({
			visible: false,
			pending: null,
		});
	});

	it('keeps the visible warning while the composer source still matches', () => {
		const info = confirmation();
		let snapshot = transitionMentionConfirmationSnapshot(createMentionConfirmationSnapshot(), {
			type: 'mentionConfirmation.requested',
			info,
			currentSourceContent: info.sourceContent,
		});

		snapshot = transitionMentionConfirmationSnapshot(snapshot, {
			type: 'mentionConfirmation.composerChanged',
			sourceContent: info.sourceContent,
		});

		expect(selectMentionConfirmationModel(snapshot)).toEqual({
			visible: true,
			pending: info,
		});
	});

	it('clears the visible warning on confirm, dismiss, or reset', () => {
		const info = confirmation();
		for (const eventType of [
			'mentionConfirmation.confirmed',
			'mentionConfirmation.dismissed',
			'mentionConfirmation.reset',
		] as const) {
			let snapshot = transitionMentionConfirmationSnapshot(createMentionConfirmationSnapshot(), {
				type: 'mentionConfirmation.requested',
				info,
				currentSourceContent: info.sourceContent,
			});

			snapshot = transitionMentionConfirmationSnapshot(snapshot, {type: eventType});

			expect(selectMentionConfirmationModel(snapshot)).toEqual({
				visible: false,
				pending: null,
			});
		}
	});
});
