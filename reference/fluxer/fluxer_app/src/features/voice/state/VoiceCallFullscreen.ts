// SPDX-License-Identifier: AGPL-3.0-or-later

import {makeAutoObservable} from 'mobx';

class VoiceCallFullscreenState {
	activeScopeKey: string | null = null;
	fullscreenRequestNonce = 0;
	private readonly mountedScopes = new Map<string, number>();

	constructor() {
		makeAutoObservable(this, {}, {autoBind: true});
	}

	get isActive(): boolean {
		return this.activeScopeKey !== null;
	}

	isScopeActive(scopeKey: string): boolean {
		return this.activeScopeKey === scopeKey;
	}

	open(scopeKey: string): void {
		this.activeScopeKey = scopeKey;
		this.fullscreenRequestNonce += 1;
	}

	close(scopeKey?: string): void {
		if (scopeKey && this.activeScopeKey !== scopeKey) return;
		this.activeScopeKey = null;
	}

	mountScope(scopeKey: string): void {
		this.mountedScopes.set(scopeKey, (this.mountedScopes.get(scopeKey) ?? 0) + 1);
	}

	unmountScope(scopeKey: string): void {
		const nextCount = (this.mountedScopes.get(scopeKey) ?? 0) - 1;
		if (nextCount > 0) {
			this.mountedScopes.set(scopeKey, nextCount);
			return;
		}
		this.mountedScopes.delete(scopeKey);
	}

	hasMountedScope(scopeKey: string): boolean {
		return (this.mountedScopes.get(scopeKey) ?? 0) > 0;
	}
}

export default new VoiceCallFullscreenState();
