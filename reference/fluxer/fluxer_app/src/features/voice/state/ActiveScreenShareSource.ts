// SPDX-License-Identifier: AGPL-3.0-or-later

import {makeAutoObservable} from 'mobx';

export interface ActiveScreenShareSourceOptions {
	readonly isOwnWindow?: boolean;
}

class ActiveScreenShareSource {
	sourceId: string | null = null;
	ownWindow = false;

	constructor() {
		makeAutoObservable(this, {}, {autoBind: true});
	}

	setSourceId(sourceId: string | null, options: ActiveScreenShareSourceOptions = {}): void {
		this.sourceId = sourceId;
		this.ownWindow = sourceId !== null && options.isOwnWindow === true;
	}

	getSourceId(): string | null {
		return this.sourceId;
	}

	isOwnWindow(): boolean {
		return this.ownWindow;
	}

	clear(): void {
		this.sourceId = null;
		this.ownWindow = false;
	}
}

export default new ActiveScreenShareSource();
