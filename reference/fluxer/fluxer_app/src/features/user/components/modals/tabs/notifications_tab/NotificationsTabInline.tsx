// SPDX-License-Identifier: AGPL-3.0-or-later

import {SettingsSection} from '@app/features/app/components/dialogs/shared/SettingsSection';
import {GENERAL_DESCRIPTOR, SOUNDS_DESCRIPTOR} from '@app/features/i18n/utils/CommonMessageDescriptors';
import Notification from '@app/features/ui/state/Notification';
import Sound from '@app/features/ui/state/Sound';
import {MentionPreferenceTabContent} from '@app/features/user/components/modals/tabs/notifications_tab/MentionPreferenceTab';
import {Notifications} from '@app/features/user/components/modals/tabs/notifications_tab/Notifications';
import styles from '@app/features/user/components/modals/tabs/notifications_tab/NotificationsTabInline.module.css';
import {Sounds} from '@app/features/user/components/modals/tabs/notifications_tab/NotificationsTabSounds';
import {TextToSpeech} from '@app/features/user/components/modals/tabs/notifications_tab/TextToSpeech';
import {useSoundSettings} from '@app/features/user/components/modals/tabs/notifications_tab/useSoundSettings';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';

const CONTROL_SPEECH_COMMANDS_AND_NARRATION_FOR_INCOMING_CONTENT_DESCRIPTOR = msg({
	message: 'Control speech commands and narration for incoming content.',
	comment: 'Description text in the inline.',
});
const MENTION_PREFERENCE_DESCRIPTOR = msg({
	message: 'Mention preference',
	comment: 'Short label in the inline. Keep it concise.',
});
const TEXT_TO_SPEECH_NOTIFICATIONS_DESCRIPTOR = msg({
	message: 'Text-to-speech notifications',
	comment: 'Short label in the inline. Keep it concise.',
});
export const NotificationsInlineContent: React.FC = observer(() => {
	const {i18n} = useLingui();
	const browserNotificationsEnabled = Notification.browserNotificationsEnabled;
	const unreadMessageBadgeEnabled = Notification.unreadMessageBadgeEnabled;
	const soundSettings = Sound.settings;
	const {
		soundTypeLabels,
		customSounds,
		handleToggleAllSounds,
		handleToggleSound,
		handlePreviewSound,
		handleUploadClick,
		handleCustomSoundDelete,
		handleMasterVolumeChange,
		handleSoundOverrideChange,
		handleSoundOverrideReset,
		handleAllOverridesReset,
	} = useSoundSettings();
	return (
		<div className={styles.container} data-flx="user.notifications-tab.inline.notifications-inline-content.container">
			<SettingsSection
				id="notifications"
				title={i18n._(GENERAL_DESCRIPTOR)}
				data-flx="user.notifications-tab.inline.notifications-inline-content.notifications"
			>
				<Notifications
					browserNotificationsEnabled={browserNotificationsEnabled}
					unreadMessageBadgeEnabled={unreadMessageBadgeEnabled}
					data-flx="user.notifications-tab.inline.notifications-inline-content.notifications--2"
				/>
			</SettingsSection>
			<SettingsSection
				id="mention-preference"
				title={i18n._(MENTION_PREFERENCE_DESCRIPTOR)}
				data-flx="user.notifications-tab.inline.notifications-inline-content.mention-preference"
			>
				<MentionPreferenceTabContent data-flx="user.notifications-tab.inline.notifications-inline-content.mention-preference-tab-content" />
			</SettingsSection>
			<SettingsSection
				id="sounds"
				title={i18n._(SOUNDS_DESCRIPTOR)}
				data-flx="user.notifications-tab.inline.notifications-inline-content.sounds"
			>
				<Sounds
					soundSettings={soundSettings}
					soundTypeLabels={soundTypeLabels}
					customSounds={customSounds}
					isSoundEnabled={Sound.isSoundTypeEnabled}
					onToggleAllSounds={handleToggleAllSounds}
					onToggleSound={handleToggleSound}
					onPreviewSound={handlePreviewSound}
					onUploadClick={handleUploadClick}
					onCustomSoundDelete={handleCustomSoundDelete}
					onMasterVolumeChange={handleMasterVolumeChange}
					onSoundOverrideChange={handleSoundOverrideChange}
					onSoundOverrideReset={handleSoundOverrideReset}
					onAllOverridesReset={handleAllOverridesReset}
					data-flx="user.notifications-tab.inline.notifications-inline-content.sounds--2"
				/>
			</SettingsSection>
			<SettingsSection
				id="text-to-speech"
				title={i18n._(TEXT_TO_SPEECH_NOTIFICATIONS_DESCRIPTOR)}
				description={i18n._(CONTROL_SPEECH_COMMANDS_AND_NARRATION_FOR_INCOMING_CONTENT_DESCRIPTOR)}
				data-flx="user.notifications-tab.inline.notifications-inline-content.text-to-speech"
			>
				<TextToSpeech data-flx="user.notifications-tab.inline.notifications-inline-content.text-to-speech--2" />
			</SettingsSection>
		</div>
	);
});
