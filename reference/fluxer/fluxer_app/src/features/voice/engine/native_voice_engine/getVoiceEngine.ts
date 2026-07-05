// SPDX-License-Identifier: AGPL-3.0-or-later

import {NativeVoiceEngine} from '@app/features/voice/engine/native_voice_engine/NativeVoiceEngine';
import {
	getNativeVoiceEngineUpgradeBlockReason,
	isNativeVoiceEngineSelected,
	NativeVoiceEngineUpgradeRequiredError,
	resetNativeVoiceEngineSelectionForTesting,
} from '@app/features/voice/engine/native_voice_engine/NativeVoiceEngineSelection';

export {
	getNativeVoiceEngineUpgradeBlockReason,
	isNativeVoiceEngineSelected,
	isNativeVoiceEngineSelectionPending,
	isNativeVoiceEngineUpgradeRequiredError,
	NATIVE_VOICE_ENGINE_BRIDGE_VERSION,
	shouldUseNativeVoiceEngine,
} from '@app/features/voice/engine/native_voice_engine/NativeVoiceEngineSelection';

let cachedEngine: NativeVoiceEngine | null = null;

export function requireNativeVoiceEngine(): NativeVoiceEngine {
	const upgradeBlockReason = getNativeVoiceEngineUpgradeBlockReason();
	if (upgradeBlockReason) {
		throw new NativeVoiceEngineUpgradeRequiredError(upgradeBlockReason);
	}
	if (!isNativeVoiceEngineSelected()) {
		throw new Error('Native voice engine is not selected');
	}
	if (cachedEngine) {
		return cachedEngine;
	}
	const bridge = window.electron?.voiceEngine;
	if (!bridge) {
		throw new Error('Native voice engine bridge is not available');
	}
	const engine = new NativeVoiceEngine(bridge);
	cachedEngine = engine;
	return engine;
}

export function resetVoiceEngineForTesting(): void {
	cachedEngine = null;
	resetNativeVoiceEngineSelectionForTesting();
}
