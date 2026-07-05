// SPDX-License-Identifier: AGPL-3.0-or-later

import {SettingsSection} from '@app/features/app/components/dialogs/shared/SettingsSection';
import {SettingsTabContainer, SettingsTabContent} from '@app/features/app/components/dialogs/shared/SettingsTabLayout';
import {GENERAL_DESCRIPTOR, SOUNDS_DESCRIPTOR} from '@app/features/i18n/utils/CommonMessageDescriptors';
import Notification from '@app/features/ui/state/Notification';
import Sound from '@app/features/ui/state/Sound';
import {MentionPreferenceTabContent} from '@app/features/user/components/modals/tabs/notifications_tab/MentionPreferenceTab';
import {Notifications} from '@app/features/user/components/modals/tabs/notifications_tab/Notifications';
import {Sounds} from '@app/features/user/components/modals/tabs/notifications_tab/NotificationsTabSounds';
import {TextToSpeech} from '@app/features/user/components/modals/tabs/notifications_tab/TextToSpeech';
import {useSoundSettings} from '@app/features/user/components/modals/tabs/notifications_tab/useSoundSettings';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';

const MENTION_PREFERENCE_SECTION_TITLE_DESCRIPTOR = msg({
	message: 'Mention preference',
	comment: 'Notifications settings: section heading for the default reply-mention behavior.',
});
const TEXT_TO_SPEECH_NOTIFICATIONS_DESCRIPTOR = msg({
	message: 'Text-to-speech notifications',
	comment: 'Notifications settings: section heading for text-to-speech notification behavior.',
});
const NotificationsTab: React.FC = observer(() => {
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
		<SettingsTabContainer data-flx="user.notifications-tab.settings-tab-container">
			<SettingsTabContent data-flx="user.notifications-tab.settings-tab-content">
				<SettingsSection
					id="notifications"
					title={i18n._(GENERAL_DESCRIPTOR)}
					data-flx="user.notifications-tab.notifications"
				>
					<Notifications
						browserNotificationsEnabled={browserNotificationsEnabled}
						unreadMessageBadgeEnabled={unreadMessageBadgeEnabled}
						data-flx="user.notifications-tab.notifications--2"
					/>
				</SettingsSection>
				<SettingsSection
					id="mention-preference"
					title={i18n._(MENTION_PREFERENCE_SECTION_TITLE_DESCRIPTOR)}
					data-flx="user.notifications-tab.mention-preference"
				>
					<MentionPreferenceTabContent data-flx="user.notifications-tab.mention-preference-tab-content" />
				</SettingsSection>
				<SettingsSection id="sounds" title={i18n._(SOUNDS_DESCRIPTOR)} data-flx="user.notifications-tab.sounds">
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
						data-flx="user.notifications-tab.sounds--2"
					/>
				</SettingsSection>
				<SettingsSection
					id="text-to-speech"
					title={i18n._(TEXT_TO_SPEECH_NOTIFICATIONS_DESCRIPTOR)}
					data-flx="user.notifications-tab.text-to-speech"
				>
					<TextToSpeech data-flx="user.notifications-tab.text-to-speech--2" />
				</SettingsSection>
			</SettingsTabContent>
		</SettingsTabContainer>
	);
});

export default NotificationsTab;
