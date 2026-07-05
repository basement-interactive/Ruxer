// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/app/components/dialogs/components/plutonium/PaymentMethodList.module.css';
import statusStyles from '@app/features/app/components/dialogs/components/plutonium/PurchaseHistoryStatus.module.css';
import {EXPIRES_DESCRIPTOR} from '@app/features/i18n/utils/CommonMessageDescriptors';
import type {PremiumBillingPaymentMethodResponse} from '@fluxer/schema/src/domains/premium/PremiumSchemas';
import type {I18n} from '@lingui/core';
import {msg} from '@lingui/core/macro';
import {Trans, useLingui} from '@lingui/react/macro';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import type React from 'react';

const PAYMENT_METHOD_DESCRIPTOR = msg({
	message: 'Payment method',
	comment: 'Fallback label for a saved billing payment method with unknown details.',
});
const NOT_AVAILABLE_DESCRIPTOR = msg({
	message: 'Not available',
	comment: 'Fallback value when a saved billing payment method has no expiration date.',
});

function formatPaymentMethod(method: PremiumBillingPaymentMethodResponse): string | null {
	if (method.type === 'card' && method.card_brand && method.card_last4) {
		return `${method.card_brand.toUpperCase()} ${method.card_last4}`;
	}
	if (method.type) return method.type;
	return null;
}

function formatPaymentExpiry(method: PremiumBillingPaymentMethodResponse): string | null {
	if (method.card_exp_month == null || method.card_exp_year == null) return null;
	return `${String(method.card_exp_month).padStart(2, '0')}/${method.card_exp_year}`;
}

function getPaymentMethodLabel(i18n: I18n, method: PremiumBillingPaymentMethodResponse): string {
	const formattedMethod = formatPaymentMethod(method);
	return formattedMethod ?? i18n._(PAYMENT_METHOD_DESCRIPTOR);
}

function getPaymentExpiryLabel(i18n: I18n, method: PremiumBillingPaymentMethodResponse): string {
	const formattedExpiry = formatPaymentExpiry(method);
	return formattedExpiry ?? i18n._(NOT_AVAILABLE_DESCRIPTOR);
}

interface PaymentMethodListProps {
	methods: ReadonlyArray<PremiumBillingPaymentMethodResponse>;
}

export const PaymentMethodList: React.FC<PaymentMethodListProps> = observer(({methods}) => {
	const {i18n} = useLingui();
	if (methods.length === 0) {
		return (
			<p className={styles.empty} data-flx="app.plutonium.payment-method-list.empty">
				<Trans comment="Quiet empty state shown when no saved payment methods are synced from the payment provider.">
					No saved payment methods.
				</Trans>
			</p>
		);
	}
	return (
		<div className={styles.list} data-flx="app.plutonium.payment-method-list.list">
			<div className={styles.header} data-flx="app.plutonium.payment-method-list.header">
				<span data-flx="app.plutonium.payment-method-list.span">
					<Trans comment="Column header for saved billing payment methods.">Method</Trans>
				</span>
				<span data-flx="app.plutonium.payment-method-list.span--2">{i18n._(EXPIRES_DESCRIPTOR)}</span>
				<span data-flx="app.plutonium.payment-method-list.span--3">
					<Trans comment="Column header for whether a saved payment method is default.">Status</Trans>
				</span>
			</div>
			{methods.map((method) => {
				const label = getPaymentMethodLabel(i18n, method);
				const expiry = getPaymentExpiryLabel(i18n, method);
				return (
					<div className={styles.row} key={method.id} data-flx="app.plutonium.payment-method-list.row">
						<span className={styles.name} data-flx="app.plutonium.payment-method-list.name">
							{label}
						</span>
						<span className={styles.meta} data-flx="app.plutonium.payment-method-list.meta">
							{expiry}
						</span>
						<span
							className={clsx(styles.status, method.is_default ? statusStyles.success : statusStyles.neutral)}
							data-flx="app.plutonium.payment-method-list.span--4"
						>
							{method.is_default ? (
								<Trans comment="Badge for the default saved payment method.">Default</Trans>
							) : (
								<Trans comment="Badge for a saved non-default payment method.">Saved</Trans>
							)}
						</span>
					</div>
				);
			})}
		</div>
	);
});
