// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';
import {isNativeVoiceEngineSelected} from '@app/features/voice/engine/native_voice_engine/NativeVoiceEngineSelection';
import type {VoiceEngineV2AppSelectedMediaMode} from '@app/features/voice/engine/v2/VoiceEngineV2AppSelectedMediaExecutionAdapter';

export interface VoiceEngineV2AppSelectedMediaFlows<T> {
	readonly js: () => Promise<T>;
	readonly native: () => Promise<T>;
}

export function resolveVoiceEngineV2AppSelectedMediaMode(): VoiceEngineV2AppSelectedMediaMode {
	const mode = isNativeVoiceEngineSelected() ? 'native' : 'js';
	assert.ok(mode === 'native' || mode === 'js', 'selected media mode must be native or js');
	return mode;
}

export async function routeVoiceEngineV2AppSelectedMedia<T>(flows: VoiceEngineV2AppSelectedMediaFlows<T>): Promise<T> {
	assert.equal(typeof flows.js, 'function', 'selected media routing requires a js flow');
	assert.equal(typeof flows.native, 'function', 'selected media routing requires a native flow');
	if (resolveVoiceEngineV2AppSelectedMediaMode() === 'native') {
		return flows.native();
	}
	return flows.js();
}
