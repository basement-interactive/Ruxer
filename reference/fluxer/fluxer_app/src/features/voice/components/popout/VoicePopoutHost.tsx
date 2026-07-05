// SPDX-License-Identifier: AGPL-3.0-or-later

import Channels from '@app/features/channel/state/Channels';
import {PopoutWindow} from '@app/features/voice/components/popout/PopoutWindow';
import styles from '@app/features/voice/components/popout/VoicePopoutHost.module.css';
import {VoicePopoutScopeContext} from '@app/features/voice/components/popout/VoicePopoutScopeContext';
import {VoiceTilePopoutContent} from '@app/features/voice/components/popout/VoiceTilePopoutContent';
import {useVoiceEngineConnectionState} from '@app/features/voice/components/useVoiceEngineConnectionState';
import {VoiceCallView} from '@app/features/voice/components/VoiceCallView';
import {
	asVoiceEngineConnectionState,
	VoiceEngineConnectionState,
} from '@app/features/voice/engine/VoiceConnectionStateMachine';
import PopoutWindowManager, {
	VOICE_CALL_POPOUT_DEFAULT_HEIGHT,
	VOICE_CALL_POPOUT_DEFAULT_WIDTH,
	VOICE_TILE_POPOUT_DEFAULT_HEIGHT,
	VOICE_TILE_POPOUT_DEFAULT_WIDTH,
	type VoiceCallPopoutDescriptor,
	type VoicePopoutDescriptor,
} from '@app/features/voice/state/PopoutWindowManager';
import {VOICE_CALL_DESCRIPTOR} from '@app/features/voice/utils/VoiceMessageDescriptors';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback, useEffect} from 'react';

const VoiceCallPopoutContent = observer(function VoiceCallPopoutContent({
	descriptor,
}: {
	descriptor: VoiceCallPopoutDescriptor;
}) {
	const channel = Channels.getChannel(descriptor.channelId);
	useEffect(() => {
		if (channel) return;
		PopoutWindowManager.close(descriptor.key);
	}, [channel, descriptor.key]);
	if (!channel) return null;
	return (
		<div className={styles.callContent} data-flx="voice.voice-popout-host.call-content">
			<VoiceCallView channel={channel} inPopout data-flx="voice.voice-popout-host.voice-call-view" />
		</div>
	);
});

const VoicePopoutWindowRenderer = observer(function VoicePopoutWindowRenderer({
	descriptor,
}: {
	descriptor: VoicePopoutDescriptor;
}) {
	const key = descriptor.key;
	const handleClosed = useCallback(() => {
		PopoutWindowManager.handleWindowClosed(key);
	}, [key]);
	const handleRestore = useCallback(() => {
		PopoutWindowManager.close(key);
	}, [key]);
	const handleToggleAlwaysOnTop = useCallback(() => {
		PopoutWindowManager.toggleAlwaysOnTop(key);
	}, [key]);
	const handleWindowOpened = useCallback(
		(childWindow: Window) => {
			PopoutWindowManager.attachWindow(key, childWindow);
		},
		[key],
	);
	const {i18n} = useLingui();
	const isCallPopout = descriptor.kind === 'call';
	const callChannelName = isCallPopout ? Channels.getChannel(descriptor.channelId)?.name : null;
	const title = isCallPopout ? (callChannelName ?? i18n._(VOICE_CALL_DESCRIPTOR)) : descriptor.title;
	return (
		<PopoutWindow
			windowKey={key}
			title={title}
			showTitlebarTitle={!isCallPopout}
			width={isCallPopout ? VOICE_CALL_POPOUT_DEFAULT_WIDTH : VOICE_TILE_POPOUT_DEFAULT_WIDTH}
			height={isCallPopout ? VOICE_CALL_POPOUT_DEFAULT_HEIGHT : VOICE_TILE_POPOUT_DEFAULT_HEIGHT}
			isAlwaysOnTop={PopoutWindowManager.isAlwaysOnTop(key)}
			onToggleAlwaysOnTop={handleToggleAlwaysOnTop}
			onRestore={handleRestore}
			onClosed={handleClosed}
			onWindowOpened={handleWindowOpened}
			data-flx="voice.voice-popout-host.popout-window"
		>
			<VoicePopoutScopeContext.Provider value={descriptor.kind}>
				{descriptor.kind === 'tile' ? (
					<VoiceTilePopoutContent
						descriptor={descriptor}
						data-flx="voice.voice-popout-host.voice-tile-popout-content"
					/>
				) : (
					<VoiceCallPopoutContent
						descriptor={descriptor}
						data-flx="voice.voice-popout-host.voice-call-popout-content"
					/>
				)}
			</VoicePopoutScopeContext.Provider>
		</PopoutWindow>
	);
});

export const VoicePopoutHost: React.FC = observer(function VoicePopoutHost() {
	const connectionState = asVoiceEngineConnectionState(useVoiceEngineConnectionState());
	const hasOpenPopouts = PopoutWindowManager.openPopoutCount > 0;
	useEffect(() => {
		if (connectionState !== VoiceEngineConnectionState.Disconnected) return;
		if (!hasOpenPopouts) return;
		PopoutWindowManager.closeAll();
	}, [connectionState, hasOpenPopouts]);
	if (!hasOpenPopouts) return null;
	return (
		<>
			{PopoutWindowManager.openPopouts.map((descriptor) => (
				<VoicePopoutWindowRenderer
					key={descriptor.key}
					descriptor={descriptor}
					data-flx="voice.voice-popout-host.voice-popout-window-renderer"
				/>
			))}
		</>
	);
});
