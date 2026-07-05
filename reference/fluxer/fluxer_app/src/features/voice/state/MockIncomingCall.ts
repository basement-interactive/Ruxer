// SPDX-License-Identifier: AGPL-3.0-or-later

import type {Channel} from '@app/features/channel/models/Channel';
import type {User} from '@app/features/user/models/User';
import {makeAutoObservable} from 'mobx';

interface MockIncomingCallData {
	channel: Channel;
	initiator: User;
}

class MockIncomingCall {
	mockCall: MockIncomingCallData | null = null;

	constructor() {
		makeAutoObservable(this);
	}

	setMockCall(data: MockIncomingCallData): void {
		this.mockCall = data;
	}

	clearMockCall(): void {
		this.mockCall = null;
	}

	isMockCall(channelId: string): boolean {
		return this.mockCall?.channel.id === channelId;
	}
}

export default new MockIncomingCall();
