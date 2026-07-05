// SPDX-License-Identifier: AGPL-3.0-or-later

import {GenericErrorModal} from '@app/features/app/components/alerts/GenericErrorModal';
import {TRY_AGAIN_IN_A_MOMENT_DESCRIPTOR} from '@app/features/i18n/utils/CommonMessageDescriptors';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';

const FAILED_TO_UPDATE_EMOJI_CLONING_DESCRIPTOR = msg({
	message: "Couldn't update emoji cloning",
	comment: "Error modal title shown when toggling whether other communities can clone this server's emojis fails.",
});
const FAILED_TO_UPDATE_STICKER_CLONING_DESCRIPTOR = msg({
	message: "Couldn't update sticker cloning",
	comment: "Error modal title shown when toggling whether other communities can clone this server's stickers fails.",
});

interface CloneSettingUpdateFailedModalProps {
	kind: 'emoji' | 'sticker';
}

export const CloneSettingUpdateFailedModal = observer(({kind}: CloneSettingUpdateFailedModalProps) => {
	const {i18n} = useLingui();
	return (
		<GenericErrorModal
			title={i18n._(
				kind === 'emoji' ? FAILED_TO_UPDATE_EMOJI_CLONING_DESCRIPTOR : FAILED_TO_UPDATE_STICKER_CLONING_DESCRIPTOR,
			)}
			message={i18n._(TRY_AGAIN_IN_A_MOMENT_DESCRIPTOR)}
			data-flx="guild.clone-setting-update-failed-modal.generic-error-modal"
		/>
	);
});
