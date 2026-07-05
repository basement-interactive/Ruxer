// SPDX-License-Identifier: AGPL-3.0-or-later

import {PREMIUM_PRODUCT_NAME} from '@app/features/app/config/I18nDisplayConstants';
import * as PremiumModalCommands from '@app/features/premium/commands/PremiumModalCommands';
import {shouldShowPremiumFeatures} from '@app/features/premium/utils/PremiumUtils';
import styles from '@app/features/ui/plutonium_link/PlutoniumLink.module.css';

export const PlutoniumLink: React.FC = () => {
	if (!shouldShowPremiumFeatures()) {
		return null;
	}
	return (
		<button
			type="button"
			onClick={() => {
				PremiumModalCommands.open();
			}}
			className={styles.link}
			data-flx="ui.plutonium-link.plutonium-link.link.open.button"
		>
			{PREMIUM_PRODUCT_NAME}
		</button>
	);
};
