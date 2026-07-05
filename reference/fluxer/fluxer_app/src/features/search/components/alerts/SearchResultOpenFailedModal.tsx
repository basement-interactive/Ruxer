// SPDX-License-Identifier: AGPL-3.0-or-later

import {GenericErrorModal} from '@app/features/app/components/alerts/GenericErrorModal';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';

const COULDN_T_OPEN_SEARCH_RESULT_DESCRIPTOR = msg({
	message: "Couldn't open search result",
	comment: 'Error message in the search result open failed modal.',
});
const WE_COULDN_T_OPEN_THAT_MESSAGE_IT_MAY_DESCRIPTOR = msg({
	message: 'That message is gone, or you lost access to the conversation.',
	comment: 'Error message in the search result open failed modal.',
});
export const SearchResultOpenFailedModal = observer(() => {
	const {i18n} = useLingui();
	return (
		<GenericErrorModal
			title={i18n._(COULDN_T_OPEN_SEARCH_RESULT_DESCRIPTOR)}
			message={i18n._(WE_COULDN_T_OPEN_THAT_MESSAGE_IT_MAY_DESCRIPTOR)}
			data-flx="search.search-result-open-failed-modal.generic-error-modal"
		/>
	);
});
