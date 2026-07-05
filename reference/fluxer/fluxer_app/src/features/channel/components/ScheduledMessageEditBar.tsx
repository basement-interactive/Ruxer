// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/channel/components/ScheduledMessageEditBar.module.css';
import wrapperStyles from '@app/features/channel/components/textarea/InputWrapper.module.css';
import FocusRing from '@app/features/ui/focus_ring/FocusRing';
import {getCurrentLocale} from '@app/features/user/utils/LocaleUtils';
import {getFormattedDateTimeInZone} from '@fluxer/date_utils/src/DateFormatting';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {ClockIcon, XCircleIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import {useCallback, useMemo} from 'react';

const EDITING_SCHEDULED_MESSAGE_DESCRIPTOR = msg({
	message: 'Editing scheduled message',
	comment: 'Button or menu action label in the channel and chat scheduled message edit bar. Keep it concise.',
});
const CANCEL_EDITING_SCHEDULED_MESSAGE_DESCRIPTOR = msg({
	message: 'Cancel editing scheduled message',
	comment: 'Button or menu action label in the channel and chat scheduled message edit bar. Keep it concise.',
});

interface ScheduledMessageEditBarProps {
	scheduledLocalAt: string;
	timezone: string;
	onCancel: () => void;
}

const formatScheduleLabel = (local: string, timezone: string): string => {
	const locale = getCurrentLocale();
	const formatted = getFormattedDateTimeInZone(local, timezone, locale);
	return `${formatted} (${timezone})`;
};
export const ScheduledMessageEditBar = observer(
	({scheduledLocalAt, timezone, onCancel}: ScheduledMessageEditBarProps) => {
		const {i18n} = useLingui();
		const scheduleLabel = useMemo(() => formatScheduleLabel(scheduledLocalAt, timezone), [scheduledLocalAt, timezone]);
		const handleStopEditing = useCallback(() => {
			onCancel();
		}, [onCancel]);
		return (
			<div
				className={`${wrapperStyles.box} ${wrapperStyles.wrapperSides} ${wrapperStyles.roundedTop} ${wrapperStyles.noBottomBorder}`}
				data-flx="channel.scheduled-message-edit-bar.div"
			>
				<div
					className={wrapperStyles.barInner}
					style={{gridTemplateColumns: '1fr auto'}}
					data-flx="channel.scheduled-message-edit-bar.div--2"
				>
					<div className={styles.text} data-flx="channel.scheduled-message-edit-bar.text">
						<div className={styles.label} data-flx="channel.scheduled-message-edit-bar.label">
							<ClockIcon className={styles.icon} weight="fill" data-flx="channel.scheduled-message-edit-bar.icon" />
							<span data-flx="channel.scheduled-message-edit-bar.span">
								{i18n._(EDITING_SCHEDULED_MESSAGE_DESCRIPTOR)}
							</span>
						</div>
						<div className={styles.timestamp} data-flx="channel.scheduled-message-edit-bar.timestamp">
							{scheduleLabel}
						</div>
					</div>
					<div className={styles.controls} data-flx="channel.scheduled-message-edit-bar.controls">
						<FocusRing offset={-2} data-flx="channel.scheduled-message-edit-bar.focus-ring">
							<button
								type="button"
								className={styles.button}
								onClick={handleStopEditing}
								aria-label={i18n._(CANCEL_EDITING_SCHEDULED_MESSAGE_DESCRIPTOR)}
								data-flx="channel.scheduled-message-edit-bar.button.stop-editing"
							>
								<XCircleIcon className={styles.icon} data-flx="channel.scheduled-message-edit-bar.icon--2" />
							</button>
						</FocusRing>
					</div>
				</div>
				<div className={wrapperStyles.separator} data-flx="channel.scheduled-message-edit-bar.div--3" />
			</div>
		);
	},
);
