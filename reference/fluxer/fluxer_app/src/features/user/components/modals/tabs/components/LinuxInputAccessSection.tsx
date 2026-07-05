// SPDX-License-Identifier: AGPL-3.0-or-later

import {PRODUCT_NAME} from '@app/features/app/config/I18nDisplayConstants';
import KeybindManager from '@app/features/app/keybindings/KeybindManager';
import NativePermission from '@app/features/permissions/system/state/NativePermission';
import {Button} from '@app/features/ui/button/Button';
import {WarningAlert} from '@app/features/ui/warning_alert/WarningAlert';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useState} from 'react';

const SYSTEM_WIDE_SHORTCUTS_DESCRIPTOR = msg({
	message: 'System-wide shortcuts',
	comment: 'Settings subsection title for keyboard and mouse shortcuts that work outside the app.',
});
const WAYLAND_DESCRIPTION_DESCRIPTOR = msg({
	message:
		'Input access is required for system-wide keyboard and mouse shortcuts on Wayland. After changing input access, fully quit and restart {productName} so shortcuts can use it.',
	comment: 'Settings warning for Linux Wayland system-wide shortcuts. {productName} is the app name.',
});
const ENABLE_DESCRIPTOR = msg({
	message: 'Enable',
	comment: 'Button label in the keybind settings system-wide shortcuts section.',
});
const RECHECK_DESCRIPTOR = msg({
	message: 'Recheck',
	comment: 'Button label in the keybind settings system-wide shortcuts section.',
});
const FINISH_RELOGIN_DESCRIPTOR = msg({
	message: 'Input access was changed. Fully quit and restart {productName} so system-wide shortcuts can use it.',
	comment: 'Status text after Linux input access was changed. {productName} is the app name.',
});
const LINUX_ERROR_DESCRIPTOR = msg({
	message:
		'Input access could not be enabled automatically. Change it manually, then fully quit and restart {productName} so shortcuts can use it.',
	comment: 'Status text after Linux input access setup failed. {productName} is the app name.',
});

type LinuxInputAccessSectionProps = React.HTMLAttributes<HTMLDivElement>;

export const LinuxInputAccessSection: React.FC<LinuxInputAccessSectionProps> = observer(() => {
	const {i18n} = useLingui();
	const [busy, setBusy] = useState(false);
	if (!NativePermission.isLinuxWaylandDesktop) return null;
	const granted = NativePermission.linuxInputAccessStatus === 'granted';
	if (granted) return null;
	const body = (() => {
		if (NativePermission.linuxInputAccessGrantNeedsRelogin) {
			return i18n._(FINISH_RELOGIN_DESCRIPTOR, {productName: PRODUCT_NAME});
		}
		if (NativePermission.linuxInputAccessGrantError) return i18n._(LINUX_ERROR_DESCRIPTOR, {productName: PRODUCT_NAME});
		return i18n._(WAYLAND_DESCRIPTION_DESCRIPTOR, {productName: PRODUCT_NAME});
	})();
	const buttonLabel = NativePermission.linuxInputAccessGrantNeedsRelogin
		? i18n._(RECHECK_DESCRIPTOR)
		: i18n._(ENABLE_DESCRIPTOR);
	const handleLinuxAction = async () => {
		setBusy(true);
		try {
			if (NativePermission.linuxInputAccessGrantNeedsRelogin) {
				await NativePermission.recheckLinuxInputAccess();
			} else {
				await NativePermission.grantLinuxInputAccess();
			}
			await KeybindManager.reapplyGlobalShortcuts();
		} finally {
			setBusy(false);
		}
	};
	return (
		<WarningAlert
			title={i18n._(SYSTEM_WIDE_SHORTCUTS_DESCRIPTOR)}
			actions={
				<Button
					variant="primary"
					small={true}
					onClick={handleLinuxAction}
					submitting={busy}
					data-flx="user.linux-input-access-section.button.enable-linux"
				>
					{buttonLabel}
				</Button>
			}
			data-flx="user.linux-input-access-section.settings-tab-section"
		>
			{body}
		</WarningAlert>
	);
});
