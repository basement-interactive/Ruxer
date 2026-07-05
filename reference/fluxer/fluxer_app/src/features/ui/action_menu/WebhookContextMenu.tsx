// SPDX-License-Identifier: AGPL-3.0-or-later

import {CopyIdIcon} from '@app/features/ui/action_menu/ContextMenuIcons';
import {MenuGroup} from '@app/features/ui/action_menu/MenuGroup';
import {MenuItem} from '@app/features/ui/action_menu/MenuItem';
import * as TextCopyCommands from '@app/features/ui/commands/TextCopyCommands';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback} from 'react';

const COPY_WEBHOOK_ID_DESCRIPTOR = msg({
	message: 'Copy webhook ID',
	comment: 'Developer-mode action that copies the webhook ID to the clipboard.',
});

interface WebhookContextMenuProps {
	webhookId: string;
	onClose: () => void;
}

export const WebhookContextMenu: React.FC<WebhookContextMenuProps> = observer(({webhookId, onClose}) => {
	const {i18n} = useLingui();
	const handleCopyWebhookId = useCallback(() => {
		TextCopyCommands.copy(i18n, webhookId, true);
		onClose();
	}, [i18n, webhookId, onClose]);
	return (
		<MenuGroup data-flx="ui.action-menu.webhook-context-menu.menu-group">
			<MenuItem
				icon={<CopyIdIcon data-flx="ui.action-menu.webhook-context-menu.copy-id-icon" />}
				onClick={handleCopyWebhookId}
				data-flx="ui.action-menu.webhook-context-menu.menu-item.copy-webhook-id"
			>
				{i18n._(COPY_WEBHOOK_ID_DESCRIPTOR)}
			</MenuItem>
		</MenuGroup>
	);
});
