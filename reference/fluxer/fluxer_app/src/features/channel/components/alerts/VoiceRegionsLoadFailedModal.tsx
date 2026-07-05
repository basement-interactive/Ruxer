// SPDX-License-Identifier: AGPL-3.0-or-later

import {GenericErrorModal} from '@app/features/app/components/alerts/GenericErrorModal';
import {TRY_AGAIN_IN_A_MOMENT_DESCRIPTOR} from '@app/features/i18n/utils/CommonMessageDescriptors';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';

const FAILED_TO_LOAD_VOICE_REGIONS_DESCRIPTOR = msg({
	message: "Couldn't load voice regions",
	comment: 'Error modal title shown when the voice regions for a channel fail to load in channel settings.',
});

export const VoiceRegionsLoadFailedModal = observer(() => {
	const {i18n} = useLingui();
	return (
		<GenericErrorModal
			title={i18n._(FAILED_TO_LOAD_VOICE_REGIONS_DESCRIPTOR)}
			message={i18n._(TRY_AGAIN_IN_A_MOMENT_DESCRIPTOR)}
			data-flx="channel.voice-regions-load-failed-modal.generic-error-modal"
		/>
	);
});
