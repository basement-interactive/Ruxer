// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	createScreenSharePickerDisplayPermissionSnapshot,
	selectScreenSharePickerDisplayPermissionPrompt,
	transitionScreenSharePickerDisplayPermissionSnapshot,
} from '@app/features/voice/components/modals/screen_share_picker_modal/ScreenSharePickerDisplayPermissionStateMachine';
import {describe, expect, it} from 'vitest';

describe('ScreenSharePickerDisplayPermissionStateMachine', () => {
	it('shows the permission prompt until screen recording is granted', () => {
		let snapshot = createScreenSharePickerDisplayPermissionSnapshot();

		expect(selectScreenSharePickerDisplayPermissionPrompt(snapshot)).toBe('none');

		snapshot = transitionScreenSharePickerDisplayPermissionSnapshot(snapshot, {type: 'permission.check'});
		expect(selectScreenSharePickerDisplayPermissionPrompt(snapshot)).toBe('checking');

		snapshot = transitionScreenSharePickerDisplayPermissionSnapshot(snapshot, {
			type: 'permission.result',
			permission: 'denied',
		});
		expect(selectScreenSharePickerDisplayPermissionPrompt(snapshot)).toBe('needs-permission');

		snapshot = transitionScreenSharePickerDisplayPermissionSnapshot(snapshot, {type: 'permission.check'});
		snapshot = transitionScreenSharePickerDisplayPermissionSnapshot(snapshot, {
			type: 'permission.result',
			permission: 'granted',
		});
		expect(selectScreenSharePickerDisplayPermissionPrompt(snapshot)).toBe('none');
	});

	it('keeps showing restart required after settings were opened', () => {
		let snapshot = createScreenSharePickerDisplayPermissionSnapshot();
		snapshot = transitionScreenSharePickerDisplayPermissionSnapshot(snapshot, {type: 'permission.check'});
		snapshot = transitionScreenSharePickerDisplayPermissionSnapshot(snapshot, {
			type: 'permission.result',
			permission: 'denied',
		});
		snapshot = transitionScreenSharePickerDisplayPermissionSnapshot(snapshot, {type: 'permission.settingsOpened'});

		expect(selectScreenSharePickerDisplayPermissionPrompt(snapshot)).toBe('restart-required');

		snapshot = transitionScreenSharePickerDisplayPermissionSnapshot(snapshot, {type: 'permission.check'});
		snapshot = transitionScreenSharePickerDisplayPermissionSnapshot(snapshot, {
			type: 'permission.result',
			permission: 'granted',
		});

		expect(selectScreenSharePickerDisplayPermissionPrompt(snapshot)).toBe('restart-required');
	});
});
