// SPDX-License-Identifier: AGPL-3.0-or-later

import {PREMIUM_PRODUCT_NAME} from '@app/features/app/config/I18nDisplayConstants';
import {
	PREMIUM_UPSELL_BANNER_DESCRIPTOR,
	VIEW_PLANS_DESCRIPTOR,
} from '@app/features/premium/utils/PremiumMessageDescriptors';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {modal} from '@app/features/ui/commands/ModalCommands';
import {PlutoniumUpsell} from '@app/features/ui/plutonium_upsell/PlutoniumUpsell';
import {UserSettingsModal} from '@app/features/user/components/modals/UserSettingsModal';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';

export const PlutoniumUpsellBanner = observer(() => {
	const {i18n} = useLingui();
	return (
		<PlutoniumUpsell
			buttonText={i18n._(VIEW_PLANS_DESCRIPTOR)}
			onButtonClick={() => {
				ModalCommands.pop();
				ModalCommands.push(
					modal(() => (
						<UserSettingsModal
							initialTab="plutonium"
							data-flx="app.plutonium.plutonium-upsell-banner.user-settings-modal"
						/>
					)),
				);
			}}
			data-flx="app.plutonium.plutonium-upsell-banner.plutonium-upsell"
		>
			{i18n._(PREMIUM_UPSELL_BANNER_DESCRIPTOR, {premiumProductName: PREMIUM_PRODUCT_NAME})}
		</PlutoniumUpsell>
	);
});
