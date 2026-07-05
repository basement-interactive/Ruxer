// SPDX-License-Identifier: AGPL-3.0-or-later

import {PRODUCT_NAME} from '@app/features/app/config/I18nDisplayConstants';
import styles from '@app/features/voice/components/modals/ScreenSharePickerModal.module.css';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import type React from 'react';

const PER_WINDOW_AUDIO_ISN_T_AVAILABLE_ON_THIS_DESCRIPTOR = msg({
	message: "App audio isn't available on this build of Windows.",
	comment: 'Inline notice on Windows when per-window audio capture is not supported. Title text.',
});
const WINDOWS_APP_AUDIO_UNSUPPORTED_BODY_DESCRIPTOR = msg({
	message: "{productName} cannot capture only one app's audio here without risking unrelated app audio or call audio.",
	comment:
		'Inline notice body on Windows. Explains that app audio is disabled because productName cannot guarantee isolated audio capture on this OS build.',
});
const WINDOWS_DESKTOP_AUDIO_UNSUPPORTED_TITLE_DESCRIPTOR = msg({
	message: "Desktop audio isn't available on this build of Windows.",
	comment:
		'Inline notice on Windows when desktop/system audio capture is not supported because Fluxer cannot exclude call audio.',
});
const WINDOWS_DESKTOP_AUDIO_UNSUPPORTED_BODY_DESCRIPTOR = msg({
	message: "{productName} cannot capture desktop audio here while excluding {productName}'s call audio.",
	comment:
		'Inline notice body on Windows. Explains that desktop audio is disabled because productName cannot exclude its own WebRTC/call playback on this OS build.',
});
const PER_WINDOW_AUDIO_ISN_T_AVAILABLE_ON_THIS_2_DESCRIPTOR = msg({
	message: "Per-window audio isn't available on this build of macOS.",
	comment: 'Inline notice on macOS when per-window audio capture is not supported. Title text.',
});
const MACOS_APP_AUDIO_UNSUPPORTED_BODY_DESCRIPTOR = msg({
	message: "{productName} cannot capture only one app's audio here without risking unrelated app audio or call audio.",
	comment:
		'Inline notice body on macOS. Explains that app audio is disabled because productName cannot guarantee isolated audio capture on this OS build.',
});
const MACOS_DESKTOP_AUDIO_UNSUPPORTED_TITLE_DESCRIPTOR = msg({
	message: "Desktop audio isn't available on this build of macOS.",
	comment:
		'Inline notice on macOS when desktop/system audio capture is not supported because Fluxer cannot exclude call audio.',
});
const MACOS_DESKTOP_AUDIO_UNSUPPORTED_BODY_DESCRIPTOR = msg({
	message: "{productName} cannot capture desktop audio here while excluding {productName}'s call audio.",
	comment:
		'Inline notice body on macOS. Explains that desktop audio is disabled because productName cannot exclude its own WebRTC/call playback on this OS build.',
});

interface PerWindowAudioNoticeProps {
	platform: 'win32' | 'darwin';
	mode?: 'app' | 'system';
}

export const PerWindowAudioNotice: React.FC<PerWindowAudioNoticeProps> = ({platform, mode = 'app'}) => {
	const {i18n} = useLingui();
	return (
		<div className={styles.osNotice} role="status" data-flx="voice.screen-share-picker-modal.os-notice">
			{platform === 'win32' ? (
				<>
					<strong data-flx="voice.screen-share-picker-modal.strong">
						{i18n._(
							mode === 'system'
								? WINDOWS_DESKTOP_AUDIO_UNSUPPORTED_TITLE_DESCRIPTOR
								: PER_WINDOW_AUDIO_ISN_T_AVAILABLE_ON_THIS_DESCRIPTOR,
						)}
					</strong>{' '}
					{i18n._(
						mode === 'system'
							? WINDOWS_DESKTOP_AUDIO_UNSUPPORTED_BODY_DESCRIPTOR
							: WINDOWS_APP_AUDIO_UNSUPPORTED_BODY_DESCRIPTOR,
						{productName: PRODUCT_NAME},
					)}
				</>
			) : (
				<>
					<strong data-flx="voice.screen-share-picker-modal.strong--2">
						{i18n._(
							mode === 'system'
								? MACOS_DESKTOP_AUDIO_UNSUPPORTED_TITLE_DESCRIPTOR
								: PER_WINDOW_AUDIO_ISN_T_AVAILABLE_ON_THIS_2_DESCRIPTOR,
						)}
					</strong>{' '}
					{i18n._(
						mode === 'system'
							? MACOS_DESKTOP_AUDIO_UNSUPPORTED_BODY_DESCRIPTOR
							: MACOS_APP_AUDIO_UNSUPPORTED_BODY_DESCRIPTOR,
						{productName: PRODUCT_NAME},
					)}
				</>
			)}
		</div>
	);
};
