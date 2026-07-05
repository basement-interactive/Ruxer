// SPDX-License-Identifier: AGPL-3.0-or-later

import type {FriendsTab} from '@app/features/channel/components/friends/FriendsTypes';
import {makeAutoObservable} from 'mobx';

class FriendsTabState {
	pendingTab: FriendsTab | null = null;

	constructor() {
		makeAutoObservable(this, {}, {autoBind: true});
	}

	setTab(tab: FriendsTab): void {
		this.pendingTab = tab;
	}

	consumeTab(): FriendsTab | null {
		const tab = this.pendingTab;
		this.pendingTab = null;
		return tab;
	}
}

export default new FriendsTabState();
