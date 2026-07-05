// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	getNativeVoiceEngineCapabilitiesSnapshot,
	getNativeVoiceEngineSelectionSnapshot,
} from '@app/features/voice/engine/native_voice_engine/NativeVoiceEngineSelection';

export function areVoiceBackgroundsAvailable(): boolean {
	const selection = getNativeVoiceEngineSelectionSnapshot();
	if (selection.state === 'checking' || selection.state === 'uninitialized') {
		return true;
	}
	if (selection.state !== 'native') {
		return false;
	}
	return getNativeVoiceEngineCapabilitiesSnapshot()?.nativeCameraBackgrounds === true;
}
