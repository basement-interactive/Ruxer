// SPDX-License-Identifier: AGPL-3.0-or-later

import {GenericErrorModal} from '@app/features/app/components/alerts/GenericErrorModal';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';

const SCREEN_SHARING_NOT_SUPPORTED_DESCRIPTOR = msg({
	message: 'Screen sharing not supported',
	comment: 'Title of the modal shown when screen sharing is not supported on the current device / browser.',
});
const SCREEN_SHARING_IS_NOT_SUPPORTED_ON_THIS_DEVICE_DESCRIPTOR = msg({
	message:
		'Screen sharing is not supported on this device or browser. This feature requires a desktop browser that supports screen sharing, such as Chrome, Firefox, or Edge on Windows, macOS, or Linux.',
	comment:
		'Body of the screen-share-unsupported modal. Mentions specific browsers and OSes; keep all proper nouns intact.',
});
const SCREEN_SHARING_PORTAL_EMPTY_DESCRIPTOR = msg({
	message:
		'No screens or windows were returned by the Linux screen sharing portal. Try again after checking that your desktop environment allows screen capture.',
	comment: 'Body of the screen-share-unsupported modal shown when xdg-desktop-portal returns no capturable sources.',
});
const SCREEN_SHARING_NOT_SUPPORTED_WITH_NATIVE_VOICE_DESCRIPTOR = msg({
	message:
		'Screen sharing is not available yet while the native voice engine is active in this desktop build. Voice and camera still work; screen share support is coming in a future update.',
	comment:
		'Body of the screen-share-unsupported modal shown on desktop when the native voice engine is active but does not yet implement screen sharing.',
});

export const ScreenShareUnsupportedModal = observer(
	({variant = 'unsupported'}: {variant?: 'unsupported' | 'portal-empty' | 'native-voice'}) => {
		const {i18n} = useLingui();
		const message =
			variant === 'portal-empty'
				? SCREEN_SHARING_PORTAL_EMPTY_DESCRIPTOR
				: variant === 'native-voice'
					? SCREEN_SHARING_NOT_SUPPORTED_WITH_NATIVE_VOICE_DESCRIPTOR
					: SCREEN_SHARING_IS_NOT_SUPPORTED_ON_THIS_DEVICE_DESCRIPTOR;
		return (
			<GenericErrorModal
				title={i18n._(SCREEN_SHARING_NOT_SUPPORTED_DESCRIPTOR)}
				message={i18n._(message)}
				data-flx="voice.screen-share-unsupported-modal.confirm-modal"
			/>
		);
	},
);
