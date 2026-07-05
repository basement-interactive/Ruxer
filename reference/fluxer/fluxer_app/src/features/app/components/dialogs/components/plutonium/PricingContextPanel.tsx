// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/app/components/dialogs/components/plutonium/PricingContextPanel.module.css';
import {ToggleButton} from '@app/features/app/components/dialogs/components/ToggleButton';
import {
	BLIK_PAYMENT_METHOD,
	MB_WAY_PAYMENT_METHOD,
	PAYMENT_PROVIDER_NAME,
	PIX_PAYMENT_METHOD,
	UPI_PAYMENT_METHOD,
} from '@app/features/app/config/I18nDisplayConstants';
import {getCurrencyCodeLabel, type PricingMode} from '@app/features/premium/utils/PricingUtils';
import {msg} from '@lingui/core/macro';
import {Trans, useLingui} from '@lingui/react/macro';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useMemo} from 'react';

const BRL_GIFT_LOCALIZED_TITLE_DESCRIPTOR = msg({
	message: 'Localized BRL gift checkout',
	comment: 'Plutonium gift checkout panel title for buyers in Brazil who selected localized BRL pricing.',
});
const BRL_GIFT_PIX_DETAIL_DESCRIPTOR = msg({
	message:
		'{pixPaymentMethod} can be used for one-time BRL payments when {paymentProviderName} offers it on the checkout page.',
	comment:
		'Plutonium gift checkout guidance for Brazil. Explains that Pix is available for one-time gift purchases via the payment provider.',
});
const BRL_GIFT_CARD_ISSUANCE_DETAIL_DESCRIPTOR = msg({
	message: 'If you pay with a card in BRL, it still needs to be issued in Brazil for the purchase to stay eligible.',
	comment:
		'Plutonium gift checkout guidance for Brazil. Clarifies that BRL card payments require a Brazil-issued card.',
});
const INR_GIFT_LOCALIZED_TITLE_DESCRIPTOR = msg({
	message: 'Localized INR gift checkout',
	comment: 'Plutonium gift checkout panel title for buyers in India who selected localized INR pricing.',
});
const INR_GIFT_UPI_DETAIL_DESCRIPTOR = msg({
	message:
		'{upiPaymentMethod} can be used for one-time INR payments when {paymentProviderName} offers it on the checkout page.',
	comment:
		'Plutonium gift checkout guidance for India. Explains that UPI is available for one-time gift purchases via the payment provider.',
});
const INR_GIFT_CARD_ISSUANCE_DETAIL_DESCRIPTOR = msg({
	message: 'If you pay with a card in INR, it still needs to be issued in India for the purchase to stay eligible.',
	comment: 'Plutonium gift checkout guidance for India. Clarifies that INR card payments require an India-issued card.',
});
const PLN_GIFT_LOCALIZED_TITLE_DESCRIPTOR = msg({
	message: 'Localized PLN gift checkout',
	comment: 'Plutonium gift checkout panel title for buyers in Poland who selected localized PLN pricing.',
});
const PLN_GIFT_BLIK_DETAIL_DESCRIPTOR = msg({
	message:
		'{blikPaymentMethod} can be used for one-time PLN gift payments, even though it does not support subscriptions in {paymentProviderName} checkout.',
	comment:
		'Plutonium gift checkout guidance for Poland. Explains that BLIK works for gifts but not for recurring subscriptions.',
});
const PLN_GIFT_CARD_ISSUANCE_DETAIL_DESCRIPTOR = msg({
	message: 'If you pay with a card in PLN, it still needs to be issued in Poland for the purchase to stay eligible.',
	comment:
		'Plutonium gift checkout guidance for Poland. Clarifies that PLN card payments require a Poland-issued card.',
});
const TRY_GIFT_LOCALIZED_TITLE_DESCRIPTOR = msg({
	message: 'Localized TRY gift checkout',
	comment: 'Plutonium gift checkout panel title for buyers in Türkiye who selected localized TRY pricing.',
});
const TRY_GIFT_CARD_ISSUANCE_DETAIL_DESCRIPTOR = msg({
	message:
		'TRY gifts are one-time payments. Cards charged in TRY still need to be issued in Türkiye for the purchase to stay eligible.',
	comment:
		'Plutonium gift checkout guidance for Türkiye. Clarifies one-time-only nature and Türkiye card issuance requirement.',
});
const TRY_GIFT_NO_LOCAL_APP_METHOD_DETAIL_DESCRIPTOR = msg({
	message: 'There is no app-based local payment method surfaced here today, so card checkout is the main path.',
	comment:
		'Plutonium gift checkout guidance for Türkiye. Notes that no local wallet method is currently available; card is the main option.',
});
const EUR_GIFT_TITLE_DESCRIPTOR = msg({
	message: 'EUR gift checkout',
	comment: 'Plutonium gift checkout panel title for buyers in Portugal paying with EUR.',
});
const EUR_GIFT_MBWAY_DETAIL_DESCRIPTOR = msg({
	message:
		'{mbWayPaymentMethod} can be used for one-time EUR gift payments when {paymentProviderName} offers it on the checkout page.',
	comment:
		'Plutonium gift checkout guidance for Portugal. Explains that MB WAY can be used for one-time EUR gift purchases.',
});
const STANDARD_GIFT_TITLE_DESCRIPTOR = msg({
	message: 'Standard {baseCurrencyLabel} gift checkout',
	comment:
		'Plutonium gift checkout panel title when the buyer opted into the standard (non-localized) currency. The currency code is interpolated.',
});
const STANDARD_GIFT_SWITCH_BACK_DETAIL_DESCRIPTOR = msg({
	message: 'Switch back to {localizedCurrencyLabel} if you prefer the localized price instead.',
	comment:
		'Plutonium gift checkout guidance. Reminds the buyer they can revert to localized pricing. The currency code is interpolated.',
});
const EUR_SUBSCRIPTION_TITLE_DESCRIPTOR = msg({
	message: 'EUR subscription checkout',
	comment: 'Plutonium subscription checkout panel title for subscribers in Portugal paying with EUR.',
});
const EUR_SUBSCRIPTION_MBWAY_ONE_TIME_DETAIL_DESCRIPTOR = msg({
	message:
		'{mbWayPaymentMethod} is a one-time payment method in {paymentProviderName} checkout, so it is not a recurring subscription path here.',
	comment:
		'Plutonium subscription checkout guidance for Portugal. Explains that MB WAY cannot be used for recurring subscriptions.',
});
const EUR_SUBSCRIPTION_USE_CARD_OR_GIFT_DETAIL_DESCRIPTOR = msg({
	message: 'Use a card for the subscription, or buy a gift instead if you want a one-time EUR payment method.',
	comment:
		'Plutonium subscription checkout guidance for Portugal. Suggests using a card for recurring billing or a gift for one-time EUR payments.',
});
const STANDARD_PRICING_TITLE_DESCRIPTOR = msg({
	message: 'Standard {baseCurrencyLabel} pricing',
	comment:
		'Plutonium subscription checkout panel title when the subscriber opted into the standard (non-localized) currency. The currency code is interpolated.',
});
const STANDARD_PRICING_FULL_PRICE_DETAIL_DESCRIPTOR = msg({
	message: 'You are using the full standard {baseCurrencyLabel} price instead of localized pricing.',
	comment:
		'Plutonium subscription checkout guidance. States that the standard (non-localized) price applies. The currency code is interpolated.',
});
const STANDARD_PRICING_SKIPS_VERIFICATION_DETAIL_DESCRIPTOR = msg({
	message:
		'This skips localized card verification. Switch back to {localizedCurrencyLabel} if you prefer the local price.',
	comment:
		'Plutonium subscription checkout guidance. Notes that the standard path skips localized verification and offers a way back.',
});
const BRL_SUBSCRIPTION_LOCALIZED_TITLE_DESCRIPTOR = msg({
	message: 'Localized BRL subscription checkout',
	comment: 'Plutonium subscription checkout panel title for subscribers in Brazil with localized BRL pricing.',
});
const BRL_SUBSCRIPTION_CARD_VERIFICATION_DETAIL_DESCRIPTOR = msg({
	message:
		'Cards can keep BRL pricing after a quick {paymentProviderName} verification, but the card must be issued in Brazil.',
	comment:
		'Plutonium subscription checkout guidance for Brazil. Explains that BRL card subscriptions need a verification step and a Brazil-issued card.',
});
const BRL_SUBSCRIPTION_PIX_RECURRING_DETAIL_DESCRIPTOR = msg({
	message:
		'{pixPaymentMethod} can skip the card verification step when {paymentProviderName} offers recurring {pixPaymentMethod2} for your checkout.',
	comment: 'Plutonium subscription checkout guidance for Brazil. Explains that recurring Pix avoids card verification.',
});
const BRL_SUBSCRIPTION_PIX_FALLBACK_DETAIL_DESCRIPTOR = msg({
	message: 'If {pixPaymentMethod} is unavailable or you prefer standard pricing, you can switch to USD at any time.',
	comment:
		'Plutonium subscription checkout guidance for Brazil. Offers USD as a fallback when Pix is not available or standard pricing is preferred.',
});
const INR_SUBSCRIPTION_LOCALIZED_TITLE_DESCRIPTOR = msg({
	message: 'Localized INR subscription checkout',
	comment: 'Plutonium subscription checkout panel title for subscribers in India with localized INR pricing.',
});
const INR_SUBSCRIPTION_CARD_VERIFICATION_DETAIL_DESCRIPTOR = msg({
	message:
		'Cards can keep INR pricing after a quick {paymentProviderName} verification, but the card must be issued in India.',
	comment:
		'Plutonium subscription checkout guidance for India. Explains that INR card subscriptions need a verification step and an India-issued card.',
});
const INR_SUBSCRIPTION_UPI_RECURRING_DETAIL_DESCRIPTOR = msg({
	message:
		'{upiPaymentMethod} can skip the card verification step when {paymentProviderName} offers recurring {upiPaymentMethod2} for your checkout.',
	comment: 'Plutonium subscription checkout guidance for India. Explains that recurring UPI avoids card verification.',
});
const INR_SUBSCRIPTION_UPI_FALLBACK_DETAIL_DESCRIPTOR = msg({
	message:
		'If recurring {upiPaymentMethod} is unavailable or you prefer standard pricing, you can switch to USD at any time.',
	comment:
		'Plutonium subscription checkout guidance for India. Offers USD as a fallback when recurring UPI is not available.',
});
const PLN_SUBSCRIPTION_LOCALIZED_TITLE_DESCRIPTOR = msg({
	message: 'Localized PLN subscription checkout',
	comment: 'Plutonium subscription checkout panel title for subscribers in Poland with localized PLN pricing.',
});
const PLN_SUBSCRIPTION_CARD_VERIFICATION_DETAIL_DESCRIPTOR = msg({
	message:
		'Cards can keep PLN pricing after a quick {paymentProviderName} verification, but the card must be issued in Poland.',
	comment:
		'Plutonium subscription checkout guidance for Poland. Explains that PLN card subscriptions need a verification step and a Poland-issued card.',
});
const PLN_SUBSCRIPTION_BLIK_UNSUPPORTED_DETAIL_DESCRIPTOR = msg({
	message: '{blikPaymentMethod} does not support subscriptions in {paymentProviderName} checkout.',
	comment:
		'Plutonium subscription checkout guidance for Poland. Clarifies that BLIK is not available for recurring subscriptions.',
});
const PLN_SUBSCRIPTION_BLIK_GIFT_FALLBACK_DETAIL_DESCRIPTOR = msg({
	message: 'If you want to use {blikPaymentMethod}, buy a PLN gift instead, or switch to standard EUR pricing.',
	comment:
		'Plutonium subscription checkout guidance for Poland. Suggests a PLN gift or standard EUR if the subscriber wants BLIK.',
});
const TRY_SUBSCRIPTION_LOCALIZED_TITLE_DESCRIPTOR = msg({
	message: 'Localized TRY subscription checkout',
	comment: 'Plutonium subscription checkout panel title for subscribers in Türkiye with localized TRY pricing.',
});
const TRY_SUBSCRIPTION_CARD_VERIFICATION_DETAIL_DESCRIPTOR = msg({
	message:
		'Cards can keep TRY pricing after a quick {paymentProviderName} verification, but the card must be issued in Türkiye.',
	comment:
		'Plutonium subscription checkout guidance for Türkiye. Explains that TRY card subscriptions need a verification step and a Türkiye-issued card.',
});
const TRY_SUBSCRIPTION_NO_LOCAL_APP_METHOD_DETAIL_DESCRIPTOR = msg({
	message:
		'There is no app-based local subscription method surfaced here today, so local card checkout is the main path.',
	comment:
		'Plutonium subscription checkout guidance for Türkiye. Notes that no local wallet method is available; card is the main option.',
});
const SWITCH_TO_STANDARD_USD_DETAIL_DESCRIPTOR = msg({
	message: 'If you prefer, you can switch to standard USD pricing instead.',
	comment: 'Plutonium subscription checkout guidance. Offers USD as a fallback option.',
});
const USING_LOCALIZED_PRICING_SUMMARY_DESCRIPTOR = msg({
	message: 'Using localized {localizedCurrencyLabel} pricing.',
	comment:
		'Compact summary line shown in Plutonium checkout when localized pricing is active. The currency code is interpolated.',
});
const USING_STANDARD_PRICING_SUMMARY_DESCRIPTOR = msg({
	message: 'Using standard {baseCurrencyLabel} pricing.',
	comment:
		'Compact summary line shown in Plutonium checkout when standard pricing is active. The currency code is interpolated.',
});
const PRICING_PREFERENCE_GROUP_LABEL_DESCRIPTOR = msg({
	message: 'Pricing preference',
	comment:
		'Accessible group label for the pricing toggle (localized vs standard) in Plutonium checkout. Not visible on screen.',
});

interface PricingContextPanelProps {
	countryCode: string | null;
	pricingMode: PricingMode;
	setPricingMode: (mode: PricingMode) => void;
	hasPricingChoice: boolean;
	localizedCurrency: string | null;
	baseCurrency: string | null;
	isGiftMode: boolean;
	compact?: boolean;
}

function getCountryContext(countryCode: string | null): 'BR' | 'IN' | 'PL' | 'PT' | 'TR' | 'OTHER' {
	const upperCountryCode = countryCode?.toUpperCase();
	switch (upperCountryCode) {
		case 'BR':
		case 'IN':
		case 'PL':
		case 'PT':
		case 'TR':
			return upperCountryCode;
		default:
			return 'OTHER';
	}
}

export const PricingContextPanel: React.FC<PricingContextPanelProps> = observer(
	({
		countryCode,
		pricingMode,
		setPricingMode,
		hasPricingChoice,
		localizedCurrency,
		baseCurrency,
		isGiftMode,
		compact = false,
	}) => {
		const {i18n} = useLingui();
		const countryContext = getCountryContext(countryCode);
		const localizedCurrencyLabel = getCurrencyCodeLabel(localizedCurrency);
		const baseCurrencyLabel = getCurrencyCodeLabel(baseCurrency);
		const guidance = useMemo(() => {
			if (isGiftMode) {
				if (pricingMode === 'localized') {
					switch (countryContext) {
						case 'BR':
							return {
								title: i18n._(BRL_GIFT_LOCALIZED_TITLE_DESCRIPTOR),
								items: [
									i18n._(BRL_GIFT_PIX_DETAIL_DESCRIPTOR, {
										pixPaymentMethod: PIX_PAYMENT_METHOD,
										paymentProviderName: PAYMENT_PROVIDER_NAME,
									}),
									i18n._(BRL_GIFT_CARD_ISSUANCE_DETAIL_DESCRIPTOR),
								],
							};
						case 'IN':
							return {
								title: i18n._(INR_GIFT_LOCALIZED_TITLE_DESCRIPTOR),
								items: [
									i18n._(INR_GIFT_UPI_DETAIL_DESCRIPTOR, {
										upiPaymentMethod: UPI_PAYMENT_METHOD,
										paymentProviderName: PAYMENT_PROVIDER_NAME,
									}),
									i18n._(INR_GIFT_CARD_ISSUANCE_DETAIL_DESCRIPTOR),
								],
							};
						case 'PL':
							return {
								title: i18n._(PLN_GIFT_LOCALIZED_TITLE_DESCRIPTOR),
								items: [
									i18n._(PLN_GIFT_BLIK_DETAIL_DESCRIPTOR, {
										blikPaymentMethod: BLIK_PAYMENT_METHOD,
										paymentProviderName: PAYMENT_PROVIDER_NAME,
									}),
									i18n._(PLN_GIFT_CARD_ISSUANCE_DETAIL_DESCRIPTOR),
								],
							};
						case 'TR':
							return {
								title: i18n._(TRY_GIFT_LOCALIZED_TITLE_DESCRIPTOR),
								items: [
									i18n._(TRY_GIFT_CARD_ISSUANCE_DETAIL_DESCRIPTOR),
									i18n._(TRY_GIFT_NO_LOCAL_APP_METHOD_DETAIL_DESCRIPTOR),
								],
							};
					}
				}
				if (countryContext === 'PT' && baseCurrency === 'EUR') {
					return {
						title: i18n._(EUR_GIFT_TITLE_DESCRIPTOR),
						items: [
							i18n._(EUR_GIFT_MBWAY_DETAIL_DESCRIPTOR, {
								mbWayPaymentMethod: MB_WAY_PAYMENT_METHOD,
								paymentProviderName: PAYMENT_PROVIDER_NAME,
							}),
						],
					};
				}
				if (hasPricingChoice && pricingMode === 'base') {
					return {
						title: i18n._(STANDARD_GIFT_TITLE_DESCRIPTOR, {baseCurrencyLabel}),
						items: [i18n._(STANDARD_GIFT_SWITCH_BACK_DETAIL_DESCRIPTOR, {localizedCurrencyLabel})],
					};
				}
				return null;
			}
			if (countryContext === 'PT' && baseCurrency === 'EUR') {
				return {
					title: i18n._(EUR_SUBSCRIPTION_TITLE_DESCRIPTOR),
					items: [
						i18n._(EUR_SUBSCRIPTION_MBWAY_ONE_TIME_DETAIL_DESCRIPTOR, {
							mbWayPaymentMethod: MB_WAY_PAYMENT_METHOD,
							paymentProviderName: PAYMENT_PROVIDER_NAME,
						}),
						i18n._(EUR_SUBSCRIPTION_USE_CARD_OR_GIFT_DETAIL_DESCRIPTOR),
					],
				};
			}
			if (pricingMode === 'base') {
				if (hasPricingChoice) {
					return {
						title: i18n._(STANDARD_PRICING_TITLE_DESCRIPTOR, {baseCurrencyLabel}),
						items: [
							i18n._(STANDARD_PRICING_FULL_PRICE_DETAIL_DESCRIPTOR, {baseCurrencyLabel}),
							i18n._(STANDARD_PRICING_SKIPS_VERIFICATION_DETAIL_DESCRIPTOR, {localizedCurrencyLabel}),
						],
					};
				}
				return null;
			}
			switch (countryContext) {
				case 'BR':
					return {
						title: i18n._(BRL_SUBSCRIPTION_LOCALIZED_TITLE_DESCRIPTOR),
						items: [
							i18n._(BRL_SUBSCRIPTION_CARD_VERIFICATION_DETAIL_DESCRIPTOR, {
								paymentProviderName: PAYMENT_PROVIDER_NAME,
							}),
							i18n._(BRL_SUBSCRIPTION_PIX_RECURRING_DETAIL_DESCRIPTOR, {
								pixPaymentMethod: PIX_PAYMENT_METHOD,
								paymentProviderName: PAYMENT_PROVIDER_NAME,
								pixPaymentMethod2: PIX_PAYMENT_METHOD,
							}),
							i18n._(BRL_SUBSCRIPTION_PIX_FALLBACK_DETAIL_DESCRIPTOR, {
								pixPaymentMethod: PIX_PAYMENT_METHOD,
							}),
						],
					};
				case 'IN':
					return {
						title: i18n._(INR_SUBSCRIPTION_LOCALIZED_TITLE_DESCRIPTOR),
						items: [
							i18n._(INR_SUBSCRIPTION_CARD_VERIFICATION_DETAIL_DESCRIPTOR, {
								paymentProviderName: PAYMENT_PROVIDER_NAME,
							}),
							i18n._(INR_SUBSCRIPTION_UPI_RECURRING_DETAIL_DESCRIPTOR, {
								upiPaymentMethod: UPI_PAYMENT_METHOD,
								paymentProviderName: PAYMENT_PROVIDER_NAME,
								upiPaymentMethod2: UPI_PAYMENT_METHOD,
							}),
							i18n._(INR_SUBSCRIPTION_UPI_FALLBACK_DETAIL_DESCRIPTOR, {
								upiPaymentMethod: UPI_PAYMENT_METHOD,
							}),
						],
					};
				case 'PL':
					return {
						title: i18n._(PLN_SUBSCRIPTION_LOCALIZED_TITLE_DESCRIPTOR),
						items: [
							i18n._(PLN_SUBSCRIPTION_CARD_VERIFICATION_DETAIL_DESCRIPTOR, {
								paymentProviderName: PAYMENT_PROVIDER_NAME,
							}),
							i18n._(PLN_SUBSCRIPTION_BLIK_UNSUPPORTED_DETAIL_DESCRIPTOR, {
								blikPaymentMethod: BLIK_PAYMENT_METHOD,
								paymentProviderName: PAYMENT_PROVIDER_NAME,
							}),
							i18n._(PLN_SUBSCRIPTION_BLIK_GIFT_FALLBACK_DETAIL_DESCRIPTOR, {blikPaymentMethod: BLIK_PAYMENT_METHOD}),
						],
					};
				case 'TR':
					return {
						title: i18n._(TRY_SUBSCRIPTION_LOCALIZED_TITLE_DESCRIPTOR),
						items: [
							i18n._(TRY_SUBSCRIPTION_CARD_VERIFICATION_DETAIL_DESCRIPTOR, {
								paymentProviderName: PAYMENT_PROVIDER_NAME,
							}),
							i18n._(TRY_SUBSCRIPTION_NO_LOCAL_APP_METHOD_DETAIL_DESCRIPTOR),
							i18n._(SWITCH_TO_STANDARD_USD_DETAIL_DESCRIPTOR),
						],
					};
				default:
					return null;
			}
		}, [
			baseCurrency,
			baseCurrencyLabel,
			countryContext,
			hasPricingChoice,
			isGiftMode,
			localizedCurrencyLabel,
			pricingMode,
			i18n.locale,
		]);
		const summary = useMemo(() => {
			if (pricingMode === 'localized') {
				if (hasPricingChoice) {
					return i18n._(USING_LOCALIZED_PRICING_SUMMARY_DESCRIPTOR, {localizedCurrencyLabel});
				}
				return null;
			}
			if (hasPricingChoice) {
				return i18n._(USING_STANDARD_PRICING_SUMMARY_DESCRIPTOR, {baseCurrencyLabel});
			}
			return null;
		}, [baseCurrencyLabel, hasPricingChoice, localizedCurrencyLabel, pricingMode, i18n.locale]);
		return (
			<div className={styles.container} data-flx="app.plutonium.pricing-context-panel.container">
				{hasPricingChoice && (
					<div
						className={styles.toggleContainer}
						role="group"
						aria-label={i18n._(PRICING_PREFERENCE_GROUP_LABEL_DESCRIPTOR)}
						data-flx="app.plutonium.pricing-context-panel.toggle-container"
					>
						<ToggleButton
							active={pricingMode === 'localized'}
							onClick={() => setPricingMode('localized')}
							label={<Trans>Local {localizedCurrencyLabel}</Trans>}
							data-flx="app.plutonium.pricing-context-panel.toggle-button.set-pricing-mode"
						/>
						<ToggleButton
							active={pricingMode === 'base'}
							onClick={() => setPricingMode('base')}
							label={<Trans>Standard {baseCurrencyLabel}</Trans>}
							data-flx="app.plutonium.pricing-context-panel.toggle-button.set-pricing-mode--2"
						/>
					</div>
				)}
				{summary && compact && (
					<p className={styles.summary} data-flx="app.plutonium.pricing-context-panel.summary">
						{summary}
					</p>
				)}
				{guidance && !compact && (
					<div
						className={clsx(styles.panel, compact && styles.panelCompact)}
						data-flx="app.plutonium.pricing-context-panel.panel"
					>
						<h3 className={styles.title} data-flx="app.plutonium.pricing-context-panel.title">
							{guidance.title}
						</h3>
						<ul className={styles.list} data-flx="app.plutonium.pricing-context-panel.list">
							{guidance.items.map((item) => (
								<li key={item} data-flx="app.plutonium.pricing-context-panel.li">
									{item}
								</li>
							))}
						</ul>
					</div>
				)}
			</div>
		);
	},
);
