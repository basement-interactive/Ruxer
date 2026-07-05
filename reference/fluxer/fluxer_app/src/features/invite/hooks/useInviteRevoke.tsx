// SPDX-License-Identifier: AGPL-3.0-or-later

import * as InviteCommands from '@app/features/invite/commands/InviteCommands';
import {InviteRevokeFailedModal} from '@app/features/invite/components/alerts/InviteRevokeFailedModal';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {modal} from '@app/features/ui/commands/ModalCommands';
import {useCallback} from 'react';

export function useInviteRevoke() {
	return useCallback(async (code: string) => {
		try {
			await InviteCommands.remove(code);
		} catch (_error) {
			ModalCommands.push(
				modal(() => <InviteRevokeFailedModal data-flx="invite.use-invite-revoke.invite-revoke-failed-modal" />),
			);
		}
	}, []);
}
