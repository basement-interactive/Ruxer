// SPDX-License-Identifier: AGPL-3.0-or-later

import {Routes} from '@app/app/Routes';
import styles from '@app/features/app/components/dialogs/components/PurchaseDisclaimer.module.css';
import {ExternalLink} from '@app/features/app/components/shared/ExternalLink';
import {Trans} from '@lingui/react/macro';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';

export const PurchaseDisclaimer = observer(
	({isPremium = false, align = 'center'}: {isPremium?: boolean; align?: 'left' | 'center'}) => {
		const terms = (
			<ExternalLink href={Routes.terms()} data-flx="app.purchase-disclaimer.external-link">
				<Trans>Terms of service</Trans>
			</ExternalLink>
		);
		const privacy = (
			<ExternalLink href={Routes.privacy()} data-flx="app.purchase-disclaimer.external-link--2">
				<Trans>Privacy policy</Trans>
			</ExternalLink>
		);
		return (
			<p
				className={clsx(styles.disclaimer, align === 'center' ? styles.center : styles.left)}
				data-flx="app.purchase-disclaimer.disclaimer"
			>
				{isPremium ? (
					<Trans>
						By purchasing, you agreed to our {terms} and {privacy}.
					</Trans>
				) : (
					<Trans>
						By purchasing, you agree to our {terms} and {privacy}.
					</Trans>
				)}{' '}
				<Trans>
					Self-serve refunds available within 3 days of payment, once every 30 days. Refunding a subscription cancels
					it. EU/EEA buyers waive the 14-day right of withdrawal at checkout to access content immediately. Use the
					in-app refund button instead of a chargeback. Chargebacks can permanently restrict your account. Stripe
					handles payment securely. We never see your full card number.
				</Trans>
			</p>
		);
	},
);
