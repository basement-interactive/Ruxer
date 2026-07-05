// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	cloneTextareaSelectionSnapshot,
	type TextareaSelectionSnapshot,
} from '@app/features/messaging/utils/TextareaSelectionUtils';

class TextareaSelection {
	private readonly channelSelections: Record<string, TextareaSelectionSnapshot> = {};
	private readonly editingSelections: Record<string, TextareaSelectionSnapshot> = {};

	setChannelSelection(channelId: string, snapshot: TextareaSelectionSnapshot): void {
		this.channelSelections[channelId] = cloneTextareaSelectionSnapshot(snapshot);
	}

	getChannelSelection(channelId: string): TextareaSelectionSnapshot | null {
		const snapshot = this.channelSelections[channelId];
		return snapshot ? cloneTextareaSelectionSnapshot(snapshot) : null;
	}

	clearChannelSelection(channelId: string): void {
		delete this.channelSelections[channelId];
	}

	setEditingSelection(channelId: string, messageId: string, snapshot: TextareaSelectionSnapshot): void {
		this.editingSelections[this.getEditingKey(channelId, messageId)] = cloneTextareaSelectionSnapshot(snapshot);
	}

	getEditingSelection(channelId: string, messageId: string): TextareaSelectionSnapshot | null {
		const snapshot = this.editingSelections[this.getEditingKey(channelId, messageId)];
		return snapshot ? cloneTextareaSelectionSnapshot(snapshot) : null;
	}

	clearEditingSelection(channelId: string, messageId: string): void {
		delete this.editingSelections[this.getEditingKey(channelId, messageId)];
	}

	private getEditingKey(channelId: string, messageId: string): string {
		return `${channelId}:${messageId}`;
	}
}

export default new TextareaSelection();
