// SPDX-License-Identifier: AGPL-3.0-or-later

export type VoiceEngineV2ParticipantE2eeState = 'encrypted' | 'decryption_failed' | 'unencrypted' | 'unknown';

export function normalizeVoiceEngineV2ParticipantE2eeState(raw: unknown): VoiceEngineV2ParticipantE2eeState {
	switch (raw) {
		case 'encrypted':
		case 'ok':
			return 'encrypted';
		case 'decryption_failed':
		case 'decryptionFailed':
		case 'error':
		case 'broken':
			return 'decryption_failed';
		case 'unencrypted':
		case 'missing_key':
		case 'missingKey':
		case 'internal_error':
			return 'unencrypted';
		default:
			return 'unknown';
	}
}
