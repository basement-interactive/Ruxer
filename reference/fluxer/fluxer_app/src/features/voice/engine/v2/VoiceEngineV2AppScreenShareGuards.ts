// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';
import {Platform} from '@app/features/platform/types/Platform';
import {logger} from '@app/features/voice/engine/voice_screen_share_manager/shared';

export const SCREEN_SHARE_UNSUPPORTED_PLATFORM_WARNING = 'Screen share not supported on native';
export const SCREEN_SHARE_SOURCE_SWITCH_UNSUPPORTED_PLATFORM_WARNING =
	'Screen share source switching is not supported on native';

export type VoiceEngineV2AppScreenShareEntryVerdict = 'proceed' | 'unsupported-platform' | 'share-pending';

export interface VoiceEngineV2AppScreenShareEntryGuardArgs {
	readonly platformUnsupportedWarning?: string;
	readonly pending?: {
		readonly active: boolean;
		readonly debugMessage: string;
		readonly onBlocked?: () => void;
	};
}

export function guardScreenShareEntry(
	args: VoiceEngineV2AppScreenShareEntryGuardArgs,
): VoiceEngineV2AppScreenShareEntryVerdict {
	assert.ok(args !== null && typeof args === 'object', 'screen-share entry guard args must be an object');
	assert.ok(
		args.platformUnsupportedWarning !== undefined || args.pending !== undefined,
		'screen-share entry guard must check at least one condition',
	);
	if (args.platformUnsupportedWarning !== undefined) {
		assert.ok(args.platformUnsupportedWarning.length > 0, 'platform warning message must not be empty');
		if (Platform.OS !== 'web') {
			logger.warn(args.platformUnsupportedWarning);
			return 'unsupported-platform';
		}
	}
	if (args.pending !== undefined) {
		assert.equal(typeof args.pending.active, 'boolean', 'pending guard active flag must be a boolean');
		assert.ok(args.pending.debugMessage.length > 0, 'pending guard debug message must not be empty');
		if (args.pending.active) {
			args.pending.onBlocked?.();
			logger.debug(args.pending.debugMessage);
			return 'share-pending';
		}
	}
	return 'proceed';
}
