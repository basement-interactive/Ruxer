// SPDX-License-Identifier: AGPL-3.0-or-later

import {SettingsSection} from '@app/features/app/components/dialogs/shared/SettingsSection';
import {SettingsTabContainer, SettingsTabContent} from '@app/features/app/components/dialogs/shared/SettingsTabLayout';
import {MEDIA_DESCRIPTOR} from '@app/features/i18n/utils/CommonMessageDescriptors';
import {InputTabContent} from '@app/features/user/components/modals/tabs/chat_settings_tab/ChatSettingsTabInputTab';
import {MediaTabContent} from '@app/features/user/components/modals/tabs/chat_settings_tab/ChatSettingsTabMediaTab';
import {DisplayTabContent} from '@app/features/user/components/modals/tabs/chat_settings_tab/DisplayTab';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';

const DISPLAY_DESCRIPTOR = msg({
	message: 'Display',
	comment: 'Short label in the chat settings tab. Keep it concise.',
});
const INPUT_DESCRIPTOR = msg({
	message: 'Input',
	comment: 'Short label in the chat settings tab. Keep it concise.',
});
const ChatSettingsTab: React.FC = observer(() => {
	const {i18n} = useLingui();
	return (
		<SettingsTabContainer data-flx="user.chat-settings-tab.settings-tab-container">
			<SettingsTabContent data-flx="user.chat-settings-tab.settings-tab-content">
				<SettingsSection id="display" title={i18n._(DISPLAY_DESCRIPTOR)} data-flx="user.chat-settings-tab.display">
					<DisplayTabContent data-flx="user.chat-settings-tab.display-tab-content" />
				</SettingsSection>
				<SettingsSection id="input" title={i18n._(INPUT_DESCRIPTOR)} data-flx="user.chat-settings-tab.input">
					<InputTabContent data-flx="user.chat-settings-tab.input-tab-content" />
				</SettingsSection>
				<SettingsSection id="media" title={i18n._(MEDIA_DESCRIPTOR)} data-flx="user.chat-settings-tab.media">
					<MediaTabContent data-flx="user.chat-settings-tab.media-tab-content" />
				</SettingsSection>
			</SettingsTabContent>
		</SettingsTabContainer>
	);
});

export default ChatSettingsTab;
