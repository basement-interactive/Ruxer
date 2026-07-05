// SPDX-License-Identifier: AGPL-3.0-or-later

import MediaEngine, {useMediaEngineVersion} from '@app/features/voice/engine/MediaEngineFacade';
import {VoiceEngineConnectionState} from '@app/features/voice/engine/VoiceConnectionStateMachine';
import {useMaybeRoomContext} from '@livekit/components-react';
import {RoomEvent} from 'livekit-client';
import {useEffect, useState} from 'react';

export function useVoiceEngineConnectionState(): VoiceEngineConnectionState {
	useMediaEngineVersion();
	const room = useMaybeRoomContext();
	const [roomState, setRoomState] = useState<unknown>(room?.state ?? VoiceEngineConnectionState.Disconnected);

	useEffect(() => {
		if (!room) {
			setRoomState(VoiceEngineConnectionState.Disconnected);
			return;
		}
		const update = () => setRoomState(room.state);
		update();
		room.on(RoomEvent.ConnectionStateChanged, update);
		return () => {
			room.off(RoomEvent.ConnectionStateChanged, update);
		};
	}, [room]);

	if (room) {
		return roomState as VoiceEngineConnectionState;
	}
	if (MediaEngine.reconnecting) return VoiceEngineConnectionState.Reconnecting;
	if (MediaEngine.connecting) return VoiceEngineConnectionState.Connecting;
	if (MediaEngine.connected) return VoiceEngineConnectionState.Connected;
	if (MediaEngine.connectFailed) return VoiceEngineConnectionState.Failed;
	return VoiceEngineConnectionState.Disconnected;
}
