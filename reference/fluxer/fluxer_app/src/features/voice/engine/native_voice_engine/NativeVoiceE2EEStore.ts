// SPDX-License-Identifier: AGPL-3.0-or-later

import {Store} from '@app/features/voice/engine/Store';
import {
	normalizeVoiceEngineV2ParticipantE2eeState,
	type VoiceEngineV2ParticipantE2eeState,
} from '@fluxer/voice_engine_v2';

export type NativeParticipantE2EEState = VoiceEngineV2ParticipantE2eeState;

export function normalizeParticipantE2EEState(raw: unknown): NativeParticipantE2EEState {
	return normalizeVoiceEngineV2ParticipantE2eeState(raw);
}

class NativeVoiceE2EEStore extends Store {
	private _stateBySid: Readonly<Record<string, NativeParticipantE2EEState>> = {};

	get stateBySid(): Readonly<Record<string, NativeParticipantE2EEState>> {
		return this._stateBySid;
	}

	hasAnyState(): boolean {
		for (const _ in this._stateBySid) return true;
		return false;
	}

	getStateForSid(sid: string): NativeParticipantE2EEState | undefined {
		return this._stateBySid[sid];
	}

	setState(sid: string, raw: unknown): void {
		if (!sid) return;
		const next = normalizeParticipantE2EEState(raw);
		if (this._stateBySid[sid] === next) return;
		this.update(() => {
			this._stateBySid = {...this._stateBySid, [sid]: next};
		});
	}

	remove(sid: string): void {
		if (!(sid in this._stateBySid)) return;
		this.update(() => {
			const next = {...this._stateBySid};
			delete next[sid];
			this._stateBySid = next;
		});
	}

	clear(): void {
		if (!this.hasAnyState()) return;
		this.update(() => {
			this._stateBySid = {};
		});
	}

	aggregateStatus(): 'encrypted' | 'broken' | 'none' {
		let sawAny = false;
		for (const sid in this._stateBySid) {
			const state = this._stateBySid[sid];
			if (!state) continue;
			sawAny = true;
			if (state !== 'encrypted') return 'broken';
		}
		return sawAny ? 'encrypted' : 'none';
	}
}

const instance = new NativeVoiceE2EEStore();

export default instance;
export {NativeVoiceE2EEStore};
