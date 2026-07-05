// SPDX-License-Identifier: AGPL-3.0-or-later

import {GenericErrorModal} from '@app/features/app/components/alerts/GenericErrorModal';
import {TRY_AGAIN_IN_A_MOMENT_DESCRIPTOR} from '@app/features/i18n/utils/CommonMessageDescriptors';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';

const FAILED_TO_UPDATE_CHANNEL_PERMISSIONS_DESCRIPTOR = msg({
	message: "Couldn't update channel permissions",
	comment: 'Error modal title shown when saving channel permission changes fails.',
});
export const ChannelPermissionsUpdateFailedModal = observer(() => {
	const {i18n} = useLingui();
	return (
		<GenericErrorModal
			title={i18n._(FAILED_TO_UPDATE_CHANNEL_PERMISSIONS_DESCRIPTOR)}
			message={i18n._(TRY_AGAIN_IN_A_MOMENT_DESCRIPTOR)}
			data-flx="channel.channel-permissions-update-failed-modal.generic-error-modal"
		/>
	);
});
