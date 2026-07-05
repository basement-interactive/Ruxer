// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/channel/components/ChannelEditBar.module.css';
import wrapperStyles from '@app/features/channel/components/textarea/InputWrapper.module.css';
import type {Channel} from '@app/features/channel/models/Channel';
import * as MessageCommands from '@app/features/messaging/commands/MessageCommands';
import FocusRing from '@app/features/ui/focus_ring/FocusRing';
import {msg} from '@lingui/core/macro';
import {Trans, useLingui} from '@lingui/react/macro';
import {XCircleIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';

const CANCEL_EDITING_MESSAGE_DESCRIPTOR = msg({
	message: 'Cancel editing message',
	comment: 'Button or menu action label in the channel and chat edit bar. Keep it concise.',
});

interface EditBarProps {
	channel: Channel;
	onCancel: () => void;
}

export const EditBar = observer(({channel, onCancel}: EditBarProps) => {
	const {i18n} = useLingui();
	const handleStopEdit = () => {
		MessageCommands.stopEditMobile(channel.id);
		onCancel();
	};
	return (
		<div
			className={`${wrapperStyles.box} ${wrapperStyles.wrapperSides} ${wrapperStyles.roundedTop} ${wrapperStyles.noBottomBorder}`}
			data-flx="channel.edit-bar.div"
		>
			<div
				className={wrapperStyles.barInner}
				style={{gridTemplateColumns: '1fr auto'}}
				data-flx="channel.edit-bar.div--2"
			>
				<div className={styles.text} data-flx="channel.edit-bar.text">
					<Trans>Editing message</Trans>
				</div>
				<div className={styles.controls} data-flx="channel.edit-bar.controls">
					<FocusRing offset={-2} data-flx="channel.edit-bar.focus-ring">
						<button
							type="button"
							className={styles.button}
							onClick={handleStopEdit}
							aria-label={i18n._(CANCEL_EDITING_MESSAGE_DESCRIPTOR)}
							data-flx="channel.edit-bar.button.stop-edit"
						>
							<XCircleIcon className={styles.icon} data-flx="channel.edit-bar.icon" />
						</button>
					</FocusRing>
				</div>
			</div>
			<div className={wrapperStyles.separator} data-flx="channel.edit-bar.div--3" />
		</div>
	);
});
