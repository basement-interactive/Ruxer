// SPDX-License-Identifier: AGPL-3.0-or-later

import DeveloperOptions from '@app/features/devtools/state/DeveloperOptions';
import MobileLayout from '@app/features/ui/state/MobileLayout';
import {MockedVoiceConnectionStatus} from '@app/features/voice/components/voice_connection_status/MockedVoiceConnectionStatus';
import {VoiceConnectionStatusInner} from '@app/features/voice/components/voice_connection_status/VoiceConnectionStatusInner';
import MediaEngine, {useMediaEngineVersion} from '@app/features/voice/engine/MediaEngineFacade';
import {observer} from 'mobx-react-lite';

export const VoiceConnectionStatus = observer(() => {
	useMediaEngineVersion();
	const storeConnectedChannelId = MediaEngine.channelId;
	const mobileLayout = MobileLayout;
	const forceShowVoiceConnection = DeveloperOptions.forceShowVoiceConnection;
	if (mobileLayout.enabled) {
		return null;
	}
	const connectedChannelId = storeConnectedChannelId;
	if (!connectedChannelId) {
		if (!forceShowVoiceConnection) {
			return null;
		}
		return <MockedVoiceConnectionStatus data-flx="voice.voice-connection-status.mocked-voice-connection-status" />;
	}
	return <VoiceConnectionStatusInner data-flx="voice.voice-connection-status.voice-connection-status-inner" />;
});
