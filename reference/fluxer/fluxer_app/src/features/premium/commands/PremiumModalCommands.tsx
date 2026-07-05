// SPDX-License-Identifier: AGPL-3.0-or-later

import RuntimeConfig from '@app/features/app/state/RuntimeConfig';
import {PremiumModal} from '@app/features/premium/components/modals/PremiumModal';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {modal} from '@app/features/ui/commands/ModalCommands';

interface OpenOptions {
	defaultGiftMode?: boolean;
}

export function open(optionsOrDefaultGiftMode: OpenOptions | boolean = {}): void {
	if (RuntimeConfig.isSelfHosted()) {
		return;
	}
	const options =
		typeof optionsOrDefaultGiftMode === 'boolean'
			? {defaultGiftMode: optionsOrDefaultGiftMode}
			: optionsOrDefaultGiftMode;
	const {defaultGiftMode = false} = options;
	ModalCommands.push(
		modal(() => (
			<PremiumModal defaultGiftMode={defaultGiftMode} data-flx="premium.premium-modal-commands.open.premium-modal" />
		)),
	);
}
