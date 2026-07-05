// SPDX-License-Identifier: AGPL-3.0-or-later

import StreamerMode from '@app/features/streamer_mode/state/StreamerMode';
import {Switch} from '@app/features/ui/components/form/FormSwitch';
import styles from '@app/features/user/components/modals/tabs/appearance_tab/StreamerModeTab.module.css';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';

const ENABLE_STREAMER_MODE_DESCRIPTOR = msg({
	message: 'Turn on streaming privacy',
	comment: 'Label for the main streaming privacy settings toggle.',
});
const STREAMER_MODE_HIDES_YOUR_PERSONAL_INFO_DESCRIPTOR = msg({
	message: 'Mask private details before sharing your screen or stream.',
	comment: 'Description for the main streaming privacy settings toggle.',
});
const AUTOMATICALLY_ENABLE_STREAMER_MODE_DESCRIPTOR = msg({
	message: 'Turn on automatically when OBS or XSplit is detected',
	comment: 'Label for the automatic streaming privacy detection settings toggle.',
});
const IF_STREAMER_MODE_IS_ENABLED_DESCRIPTOR = msg({
	message: 'When streaming privacy is on',
	comment: 'Legend for streaming privacy behavior settings.',
});
const HIDE_PERSONAL_INFORMATION_DESCRIPTOR = msg({
	message: 'Mask private account details like email, linked accounts, and notes',
	comment: 'Label for a streaming privacy settings toggle.',
});
const HIDE_INVITE_LINKS_DESCRIPTOR = msg({
	message: 'Mask community invite links',
	comment: 'Label for a streaming privacy settings toggle.',
});
const DISABLE_ALL_SOUND_EFFECTS_DESCRIPTOR = msg({
	message: 'Mute app sound effects',
	comment: 'Label for a streaming privacy settings toggle.',
});
const DISABLE_NOTIFICATIONS_DESCRIPTOR = msg({
	message: 'Pause notifications',
	comment: 'Label for a streaming privacy settings toggle.',
});

export const StreamerModeTabContent: React.FC = observer(() => {
	const {i18n} = useLingui();
	return (
		<div className={styles.container} data-flx="user.appearance-tab.streamer-mode-tab.container">
			<Switch
				label={i18n._(ENABLE_STREAMER_MODE_DESCRIPTOR)}
				description={i18n._(STREAMER_MODE_HIDES_YOUR_PERSONAL_INFO_DESCRIPTOR)}
				value={StreamerMode.manualEnabled}
				onChange={StreamerMode.setManualEnabled}
				data-flx="user.appearance-tab.streamer-mode-tab.streamer-mode-tab-content.switch.set-manual-enabled"
			/>
			<Switch
				label={i18n._(AUTOMATICALLY_ENABLE_STREAMER_MODE_DESCRIPTOR)}
				value={StreamerMode.autoEnable}
				onChange={StreamerMode.setAutoEnable}
				data-flx="user.appearance-tab.streamer-mode-tab.streamer-mode-tab-content.switch.set-auto-enable"
			/>
			<fieldset className={styles.behaviorGroup} data-flx="user.appearance-tab.streamer-mode-tab.behavior-group">
				<legend className={styles.behaviorLegend} data-flx="user.appearance-tab.streamer-mode-tab.behavior-legend">
					{i18n._(IF_STREAMER_MODE_IS_ENABLED_DESCRIPTOR)}
				</legend>
				<div className={styles.behaviorStack} data-flx="user.appearance-tab.streamer-mode-tab.behavior-stack">
					<Switch
						label={i18n._(HIDE_PERSONAL_INFORMATION_DESCRIPTOR)}
						value={StreamerMode.hidePersonalInformation}
						onChange={StreamerMode.setHidePersonalInformation}
						data-flx="user.appearance-tab.streamer-mode-tab.streamer-mode-tab-content.switch.set-hide-personal-information"
					/>
					<Switch
						label={i18n._(HIDE_INVITE_LINKS_DESCRIPTOR)}
						value={StreamerMode.hideInviteLinks}
						onChange={StreamerMode.setHideInviteLinks}
						data-flx="user.appearance-tab.streamer-mode-tab.streamer-mode-tab-content.switch.set-hide-invite-links"
					/>
					<Switch
						label={i18n._(DISABLE_ALL_SOUND_EFFECTS_DESCRIPTOR)}
						value={StreamerMode.disableSounds}
						onChange={StreamerMode.setDisableSounds}
						data-flx="user.appearance-tab.streamer-mode-tab.streamer-mode-tab-content.switch.set-disable-sounds"
					/>
					<Switch
						label={i18n._(DISABLE_NOTIFICATIONS_DESCRIPTOR)}
						value={StreamerMode.disableNotifications}
						onChange={StreamerMode.setDisableNotifications}
						data-flx="user.appearance-tab.streamer-mode-tab.streamer-mode-tab-content.switch.set-disable-notifications"
					/>
				</div>
			</fieldset>
		</div>
	);
});
