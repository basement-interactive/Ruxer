// SPDX-License-Identifier: AGPL-3.0-or-later

import ExpressionPicker from '@app/features/emoji/state/ExpressionPicker';
import type {ExpressionPickerTabType} from '@app/features/expressions/components/popouts/ExpressionPickerPopout';
import {Logger} from '@app/features/platform/utils/AppLogger';

const logger = new Logger('ExpressionPicker');

type ExpressionPickerIntent =
	| {kind: 'open'; channelId: string; tab?: ExpressionPickerTabType}
	| {kind: 'close'}
	| {kind: 'toggle'; channelId: string; tab: ExpressionPickerTabType}
	| {kind: 'tab'; tab: ExpressionPickerTabType};

function dispatchExpressionPickerIntent(intent: ExpressionPickerIntent): void {
	switch (intent.kind) {
		case 'open':
			ExpressionPicker.open(intent.channelId, intent.tab);
			return;
		case 'close':
			ExpressionPicker.close();
			return;
		case 'toggle':
			ExpressionPicker.toggle(intent.channelId, intent.tab);
			return;
		case 'tab':
			ExpressionPicker.setTab(intent.tab);
			return;
	}
}

export function open(channelId: string, tab?: ExpressionPickerTabType): void {
	logger.debug(`Opening expression picker for channel ${channelId}, tab: ${tab}`);
	dispatchExpressionPickerIntent({kind: 'open', channelId, tab});
}

export function close(): void {
	logger.debug('Closing expression picker');
	dispatchExpressionPickerIntent({kind: 'close'});
}

export function toggle(channelId: string, tab: ExpressionPickerTabType): void {
	logger.debug(`Toggling expression picker for channel ${channelId}, tab: ${tab}`);
	dispatchExpressionPickerIntent({kind: 'toggle', channelId, tab});
}

export function setTab(tab: ExpressionPickerTabType): void {
	logger.debug(`Setting expression picker tab to: ${tab}`);
	dispatchExpressionPickerIntent({kind: 'tab', tab});
}
