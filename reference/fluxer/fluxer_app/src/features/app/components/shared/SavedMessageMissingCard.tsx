// SPDX-License-Identifier: AGPL-3.0-or-later

import previewStyles from '@app/features/app/components/shared/MessagePreview.module.css';
import FocusRing from '@app/features/ui/focus_ring/FocusRing';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {WarningCircleIcon} from '@phosphor-icons/react';

const YOU_LOST_ACCESS_TO_THIS_SAVED_MESSAGE_REMOVE_DESCRIPTOR = msg({
	message: 'You lost access to this saved message. Remove?',
	comment:
		'Saved-messages card prompt shown when the user no longer has access to a saved message and is offered to remove it.',
});
const REMOVE_DESCRIPTOR = msg({
	message: 'Remove',
	comment: 'Short label in the shared app saved message missing card. Keep the tone plain and specific.',
});

interface SavedMessageMissingCardProps {
	entryId: string;
	onRemove: () => void;
}

export const SavedMessageMissingCard = ({entryId, onRemove}: SavedMessageMissingCardProps) => {
	const {i18n} = useLingui();
	return (
		<div key={`lost-${entryId}`} className={previewStyles.previewCard} data-flx="app.saved-message-missing-card.div">
			<div className={previewStyles.lostMessageInner} data-flx="app.saved-message-missing-card.div--2">
				<WarningCircleIcon
					className={previewStyles.lostMessageIcon}
					weight="duotone"
					data-flx="app.saved-message-missing-card.warning-circle-icon"
				/>
				<p className={previewStyles.lostMessageText} data-flx="app.saved-message-missing-card.p">
					{i18n._(YOU_LOST_ACCESS_TO_THIS_SAVED_MESSAGE_REMOVE_DESCRIPTOR)}
				</p>
			</div>
			<div className={previewStyles.actionButtons} data-flx="app.saved-message-missing-card.div--3">
				<FocusRing offset={-2} data-flx="app.saved-message-missing-card.focus-ring">
					<button
						type="button"
						className={previewStyles.actionButton}
						onClick={onRemove}
						data-flx="app.saved-message-missing-card.button.remove"
					>
						{i18n._(REMOVE_DESCRIPTOR)}
					</button>
				</FocusRing>
			</div>
		</div>
	);
};
