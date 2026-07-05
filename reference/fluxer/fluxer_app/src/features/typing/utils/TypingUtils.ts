// SPDX-License-Identifier: AGPL-3.0-or-later

import Authentication from '@app/features/auth/state/Authentication';
import * as TypingCommands from '@app/features/typing/commands/TypingCommands';
import {
	createLocalTypingSnapshot,
	type LocalTypingMachineEvent,
	type LocalTypingModel,
	type LocalTypingSnapshot,
	selectLocalTypingModel,
	transitionLocalTypingSnapshot,
} from '@app/features/typing/state/LocalTypingStateMachine';

class TypingManager {
	private snapshot: LocalTypingSnapshot = createLocalTypingSnapshot();
	private timeoutId: NodeJS.Timeout | null = null;

	typing(channelId: string): void {
		const currentUserId = Authentication.currentUserId;
		if (!currentUserId) {
			return;
		}
		this.transition(
			{
				type: 'localTyping.started',
				channelId,
				now: Date.now(),
			},
			currentUserId,
		);
	}

	clear(channelId: string): void {
		const currentUserId = Authentication.currentUserId;
		if (!currentUserId) {
			return;
		}
		this.transition(
			{
				type: 'localTyping.stopped',
				channelId,
			},
			currentUserId,
		);
	}

	private transition(event: LocalTypingMachineEvent, currentUserId: string): void {
		const previousModel = selectLocalTypingModel(this.snapshot);
		this.snapshot = transitionLocalTypingSnapshot(this.snapshot, event);
		const nextModel = selectLocalTypingModel(this.snapshot);
		this.applyLocalTypingMutation(previousModel, nextModel, currentUserId, event);
		this.applyRemoteSendSchedule(previousModel, nextModel);
	}

	private applyLocalTypingMutation(
		previousModel: LocalTypingModel,
		nextModel: LocalTypingModel,
		userId: string,
		event: LocalTypingMachineEvent,
	): void {
		if (previousModel.localTyping && previousModel.channelId && previousModel.channelId !== nextModel.channelId) {
			TypingCommands.stopLocalTyping(previousModel.channelId, userId);
		}
		if (previousModel.localTyping && !nextModel.localTyping && previousModel.channelId) {
			TypingCommands.stopLocalTyping(previousModel.channelId, userId);
			return;
		}
		if (event.type === 'localTyping.started' && nextModel.localTyping && nextModel.channelId) {
			TypingCommands.startLocalTyping(nextModel.channelId, userId);
		}
	}

	private applyRemoteSendSchedule(previousModel: LocalTypingModel, nextModel: LocalTypingModel): void {
		if (!nextModel.remotePending || !nextModel.channelId) {
			this.clearRemoteSendTimer();
			return;
		}
		if (
			previousModel.remotePending &&
			previousModel.channelId === nextModel.channelId &&
			previousModel.remotePendingVersion === nextModel.remotePendingVersion
		) {
			return;
		}
		this.clearRemoteSendTimer();
		const channelId = nextModel.channelId;
		const pendingVersion = nextModel.remotePendingVersion;
		this.timeoutId = setTimeout(() => {
			this.sendTyping(channelId, pendingVersion);
		}, nextModel.remoteSendDelayMs);
	}

	private sendTyping(channelId: string, pendingVersion: number): void {
		TypingCommands.sendTyping(channelId);
		this.timeoutId = null;
		const currentUserId = Authentication.currentUserId;
		if (!currentUserId) {
			return;
		}
		this.transition(
			{
				type: 'localTyping.remoteSent',
				channelId,
				now: Date.now(),
				pendingVersion,
			},
			currentUserId,
		);
	}

	private clearRemoteSendTimer(): void {
		if (!this.timeoutId) {
			return;
		}
		clearTimeout(this.timeoutId);
		this.timeoutId = null;
	}
}

export const TypingUtils = new TypingManager();
