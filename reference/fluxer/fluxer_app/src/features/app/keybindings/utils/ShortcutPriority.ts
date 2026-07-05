// SPDX-License-Identifier: AGPL-3.0-or-later

import type {KeybindCommand} from '@app/features/input/state/InputKeybind';

export const LOCAL_SHORTCUT_ACTION_PRIORITY: Partial<Record<KeybindCommand, number>> = {
	voice_decline_call: 100,
	message_focus_textarea: 50,
	chat_mark_channel_read: 10,
};
