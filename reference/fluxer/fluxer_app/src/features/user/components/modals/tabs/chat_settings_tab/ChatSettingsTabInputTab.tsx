// SPDX-License-Identifier: AGPL-3.0-or-later

import ChatInputSettings from '@app/features/messaging/state/ChatInputSettings';
import {Switch} from '@app/features/ui/components/form/FormSwitch';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';

const CONVERT_EMOTICONS_TO_EMOJI_DESCRIPTOR = msg({
	message: 'Turn text smileys into emoji',
	comment: 'Label in the input tab.',
});

interface InputSwitchControlProps {
	compact?: boolean;
}

export const ConvertEmoticonsControl: React.FC<InputSwitchControlProps> = observer(({compact = false}) => {
	const {i18n} = useLingui();
	const label = i18n._(CONVERT_EMOTICONS_TO_EMOJI_DESCRIPTOR);
	return (
		<Switch
			ariaLabel={label}
			label={compact ? undefined : label}
			value={ChatInputSettings.convertEmoticons}
			onChange={ChatInputSettings.setConvertEmoticons}
			compact={compact}
			data-flx="user.chat-settings-tab.input-tab.convert-emoticons-control.switch"
		/>
	);
});

export const InputTabContent: React.FC = observer(() => {
	return <ConvertEmoticonsControl data-flx="user.chat-settings-tab.input-tab.input-tab-content.convert-emoticons" />;
});
