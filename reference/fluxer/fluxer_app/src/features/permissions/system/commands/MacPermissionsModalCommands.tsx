// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	type MediaPermissionBlockedKind,
	MediaPermissionBlockedModal,
} from '@app/features/permissions/system/components/MediaPermissionBlockedModal';
import {MacPermissionsModal} from '@app/features/permissions/system/components/modals/MacPermissionsModal';
import MacPermissions, {type MacPermissionKind} from '@app/features/permissions/system/state/MacPermissions';
import {modal, push, pushWithKey} from '@app/features/ui/commands/ModalCommands';
import {getNativePlatformSync, isDesktop} from '@app/features/ui/utils/NativeUtils';

const MAC_PERMISSIONS_MODAL_KEY = 'mac-permissions';

export function openMacPermissionsModal(options: {focus?: MacPermissionKind} = {}): void {
	pushWithKey(
		modal(() => (
			<MacPermissionsModal
				focus={options.focus}
				data-flx="permissions.system.mac-permissions-modal-commands.open-mac-permissions-modal.mac-permissions-modal"
			/>
		)),
		MAC_PERMISSIONS_MODAL_KEY,
	);
}

export function handleMediaPermissionBlocked(kind: MediaPermissionBlockedKind): void {
	if (isDesktop() && getNativePlatformSync() === 'macos') {
		if (MacPermissions.hasDeclined(kind)) return;
		openMacPermissionsModal({focus: kind});
		return;
	}
	push(
		modal(() => (
			<MediaPermissionBlockedModal
				kind={kind}
				data-flx="permissions.system.mac-permissions-modal-commands.handle-media-permission-blocked.media-permission-blocked-modal"
			/>
		)),
	);
}
