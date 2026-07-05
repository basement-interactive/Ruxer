// SPDX-License-Identifier: AGPL-3.0-or-later

import Authentication from '@app/features/auth/state/Authentication';
import {CreateDMModal} from '@app/features/channel/components/modals/CreateDMModal';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {getElectronAPI} from '@app/features/ui/utils/NativeUtils';
import React from 'react';

export function startDesktopJumpListBridge(): void {
	const electronApi = getElectronAPI();
	if (!electronApi || typeof electronApi.onJumpListNewDm !== 'function') return;
	electronApi.onJumpListNewDm(() => {
		if (!Authentication.isAuthenticated) return;
		ModalCommands.push(ModalCommands.modal(() => React.createElement(CreateDMModal)));
	});
}
