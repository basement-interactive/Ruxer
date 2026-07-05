// SPDX-License-Identifier: AGPL-3.0-or-later

import {handleMediaPermissionBlocked} from '@app/features/permissions/system/commands/MacPermissionsModalCommands';
import {ScreenRecordingPermissionDeniedError} from '@app/features/permissions/system/utils/ScreenRecordingPermissionDeniedError';
import {Logger} from '@app/features/platform/utils/AppLogger';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {modal} from '@app/features/ui/commands/ModalCommands';
import {ScreenShareFailedModal} from '@app/features/voice/components/alerts/ScreenShareFailedModal';
import {ScreenShareUnsupportedModal} from '@app/features/voice/components/alerts/ScreenShareUnsupportedModal';
import {isNativeVoiceScreenShareUnsupportedError} from '@app/features/voice/engine/v2/VoiceEngineV2AppScreenShareExecutionAdapter';
import {isScreenSharePortalUnavailableError} from '@app/features/voice/utils/ScreenSharePortalUnavailableError';

const logger = new Logger('ScreenShareUtils');
const isScreenShareUnsupportedError = (error: unknown): boolean => {
	if (!(error instanceof Error)) return false;
	return (
		error.name === 'DeviceUnsupportedError' || error.name === 'NotSupportedError' || error.name === 'NotAllowedError'
	);
};
const handleScreenShareError = (error: unknown): void => {
	if (error instanceof ScreenRecordingPermissionDeniedError) {
		handleMediaPermissionBlocked('screen');
		return;
	}
	if (isScreenSharePortalUnavailableError(error)) {
		logger.warn('Wayland screen share portal unavailable; portal modal is surfaced by the picker IPC handler', {
			reason: error.reason,
		});
		return;
	}
	if (isNativeVoiceScreenShareUnsupportedError(error)) {
		logger.info('Screen share unavailable while native voice engine is active; showing not-supported modal');
		ModalCommands.push(
			modal(() => (
				<ScreenShareUnsupportedModal
					variant="native-voice"
					data-flx="voice.screen-share-utils.handle-screen-share-error.screen-share-native-voice-unsupported-modal"
				/>
			)),
		);
		return;
	}
	if (isScreenShareUnsupportedError(error)) {
		ModalCommands.push(
			modal(() => (
				<ScreenShareUnsupportedModal data-flx="voice.screen-share-utils.handle-screen-share-error.screen-share-unsupported-modal" />
			)),
		);
	} else {
		logger.error('Failed to start screen share:', error);
		ModalCommands.push(
			modal(() => (
				<ScreenShareFailedModal data-flx="voice.screen-share-utils.handle-screen-share-error.screen-share-failed-modal" />
			)),
		);
	}
};

export async function executeScreenShareOperation(
	operation: () => Promise<void>,
	onError?: (error: unknown) => void,
): Promise<void> {
	try {
		await operation();
	} catch (error) {
		handleScreenShareError(error);
		if (onError) {
			onError(error);
		}
		throw error;
	}
}
