// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	createVoiceEngineV2MemoryEventLogSpillSink,
	type VoiceEngineV2HostPorts,
	type VoiceEngineV2RuntimeClock,
} from '@fluxer/voice_engine_v2';
import {
	createVoiceEngineV2AppControllerHost,
	type VoiceEngineV2AppControllerHost,
} from './VoiceEngineV2AppControllerHost';

export interface VoiceEngineV2AppTestControllerHostOptions {
	ports: VoiceEngineV2HostPorts;
	clock?: VoiceEngineV2RuntimeClock;
}

export function createVoiceEngineV2AppTestControllerHost(
	options: VoiceEngineV2AppTestControllerHostOptions,
): VoiceEngineV2AppControllerHost {
	return createVoiceEngineV2AppControllerHost({
		...options,
		eventLogSpillSink: createVoiceEngineV2MemoryEventLogSpillSink(),
	});
}
