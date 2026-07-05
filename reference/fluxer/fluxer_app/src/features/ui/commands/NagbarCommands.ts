// SPDX-License-Identifier: AGPL-3.0-or-later

import Nagbar, {type NagbarToggleKey} from '@app/features/ui/state/Nagbar';

type NagbarIntent =
	| {kind: 'dismiss'; nagbarType: NagbarToggleKey}
	| {kind: 'dismiss-invites-disabled'; guildId: string}
	| {kind: 'dismiss-guild-mfa-requirement'; guildId: string}
	| {kind: 'reset'; nagbarType: NagbarToggleKey}
	| {kind: 'reset-all'}
	| {kind: 'force-hide'; key: NagbarToggleKey; value: boolean};

function dispatchNagbarIntent(intent: NagbarIntent): void {
	switch (intent.kind) {
		case 'dismiss':
			Nagbar.dismiss(intent.nagbarType);
			return;
		case 'dismiss-invites-disabled':
			Nagbar.dismissInvitesDisabled(intent.guildId);
			return;
		case 'dismiss-guild-mfa-requirement':
			Nagbar.dismissGuildMfaRequirement(intent.guildId);
			return;
		case 'reset':
			Nagbar.reset(intent.nagbarType);
			return;
		case 'reset-all':
			Nagbar.resetAll();
			return;
		case 'force-hide':
			Nagbar.setFlag(intent.key, intent.value);
			return;
	}
}

export function dismissNagbar(nagbarType: NagbarToggleKey): void {
	dispatchNagbarIntent({kind: 'dismiss', nagbarType});
}

export function dismissInvitesDisabledNagbar(guildId: string): void {
	dispatchNagbarIntent({kind: 'dismiss-invites-disabled', guildId});
}

export function dismissGuildMfaRequirementNagbar(guildId: string): void {
	dispatchNagbarIntent({kind: 'dismiss-guild-mfa-requirement', guildId});
}

export function resetNagbar(nagbarType: NagbarToggleKey): void {
	dispatchNagbarIntent({kind: 'reset', nagbarType});
}

export function resetAllNagbars(): void {
	dispatchNagbarIntent({kind: 'reset-all'});
}

export function setForceHideNagbar(key: NagbarToggleKey, value: boolean): void {
	dispatchNagbarIntent({kind: 'force-hide', key, value});
}
