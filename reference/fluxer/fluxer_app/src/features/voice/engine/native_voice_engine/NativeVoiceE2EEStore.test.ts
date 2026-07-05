// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	NativeVoiceE2EEStore,
	normalizeParticipantE2EEState,
} from '@app/features/voice/engine/native_voice_engine/NativeVoiceE2EEStore';
import {beforeEach, describe, expect, it} from 'vitest';

let store: NativeVoiceE2EEStore;

beforeEach(() => {
	store = new NativeVoiceE2EEStore();
});

describe('normalizeParticipantE2EEState', () => {
	it('maps engine spellings onto the closed set', () => {
		expect(normalizeParticipantE2EEState('encrypted')).toBe('encrypted');
		expect(normalizeParticipantE2EEState('ok')).toBe('encrypted');
		expect(normalizeParticipantE2EEState('decryption_failed')).toBe('decryption_failed');
		expect(normalizeParticipantE2EEState('decryptionFailed')).toBe('decryption_failed');
		expect(normalizeParticipantE2EEState('error')).toBe('decryption_failed');
		expect(normalizeParticipantE2EEState('missing_key')).toBe('unencrypted');
		expect(normalizeParticipantE2EEState('unencrypted')).toBe('unencrypted');
		expect(normalizeParticipantE2EEState('???')).toBe('unknown');
		expect(normalizeParticipantE2EEState(undefined)).toBe('unknown');
	});
});

describe('NativeVoiceE2EEStore', () => {
	it('starts empty with a none aggregate', () => {
		expect(store.hasAnyState()).toBe(false);
		expect(store.aggregateStatus()).toBe('none');
	});

	it('records and normalises per-participant state', () => {
		store.setState('PA_1', 'ok');
		expect(store.getStateForSid('PA_1')).toBe('encrypted');
		expect(store.hasAnyState()).toBe(true);
	});

	it('ignores an empty sid', () => {
		store.setState('', 'encrypted');
		expect(store.hasAnyState()).toBe(false);
	});

	it('aggregates to encrypted when every participant is encrypted', () => {
		store.setState('PA_1', 'encrypted');
		store.setState('PA_2', 'ok');
		expect(store.aggregateStatus()).toBe('encrypted');
	});

	it('aggregates to broken when any participant is not encrypted', () => {
		store.setState('PA_1', 'encrypted');
		store.setState('PA_2', 'decryption_failed');
		expect(store.aggregateStatus()).toBe('broken');
	});

	it('removes one participant and clears all', () => {
		store.setState('PA_1', 'encrypted');
		store.setState('PA_2', 'encrypted');
		store.remove('PA_1');
		expect(store.getStateForSid('PA_1')).toBeUndefined();
		expect(store.aggregateStatus()).toBe('encrypted');
		store.clear();
		expect(store.hasAnyState()).toBe(false);
		expect(store.aggregateStatus()).toBe('none');
	});
});
