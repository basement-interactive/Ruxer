// SPDX-License-Identifier: AGPL-3.0-or-later

import type {ScheduledMessage, ScheduledMessagePayload} from '@app/features/messaging/models/ScheduledMessage';
import {makeAutoObservable} from 'mobx';

interface ScheduledMessageEditState {
	scheduledMessageId: string;
	channelId: string;
	payload: ScheduledMessagePayload;
	scheduledLocalAt: string;
	timezone: string;
}

class ScheduledMessageEditor {
	private state: ScheduledMessageEditState | null = null;

	constructor() {
		makeAutoObservable(this, {}, {autoBind: true});
	}

	startEditing(record: ScheduledMessage): void {
		this.state = {
			scheduledMessageId: record.id,
			channelId: record.channelId,
			payload: record.payload,
			scheduledLocalAt: record.scheduledLocalAt,
			timezone: record.timezone,
		};
	}

	stopEditing(): void {
		this.state = null;
	}

	isEditingChannel(channelId: string): boolean {
		return this.state?.channelId === channelId;
	}

	getEditingState(): ScheduledMessageEditState | null {
		return this.state;
	}
}

export default new ScheduledMessageEditor();
