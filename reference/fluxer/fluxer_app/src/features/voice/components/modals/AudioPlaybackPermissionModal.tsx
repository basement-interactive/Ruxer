// SPDX-License-Identifier: AGPL-3.0-or-later

import {ConfirmModal} from '@app/features/app/components/dialogs/ConfirmModal';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';

const BROWSER_AUDIO_REQUIRED_DESCRIPTOR = msg({
	message: 'Browser audio required',
	comment: 'Title of the modal shown when the browser autoplay policy blocks voice audio until the user interacts.',
});
const YOUR_BROWSER_REQUIRES_USER_INTERACTION_BEFORE_AUDIO_CAN_DESCRIPTOR = msg({
	message:
		'Your browser requires user interaction before audio can be played. Click the button below to enable voice chat.',
	comment: 'Body of the browser-audio-required modal explaining why the user must click before audio can play.',
});
const ENABLE_AUDIO_DESCRIPTOR = msg({
	message: 'Enable audio',
	comment: 'Primary button on the browser-audio-required modal. Unlocks audio playback.',
});

interface AudioPlaybackPermissionModalProps {
	onStartAudio: () => Promise<void>;
}

export const AudioPlaybackPermissionModal = observer(({onStartAudio}: AudioPlaybackPermissionModalProps) => {
	const {i18n} = useLingui();
	return (
		<ConfirmModal
			title={i18n._(BROWSER_AUDIO_REQUIRED_DESCRIPTOR)}
			description={i18n._(YOUR_BROWSER_REQUIRES_USER_INTERACTION_BEFORE_AUDIO_CAN_DESCRIPTOR)}
			primaryText={i18n._(ENABLE_AUDIO_DESCRIPTOR)}
			primaryVariant="primary"
			secondaryText={false}
			onPrimary={onStartAudio}
			data-flx="voice.audio-playback-permission-modal.confirm-modal"
		/>
	);
});
