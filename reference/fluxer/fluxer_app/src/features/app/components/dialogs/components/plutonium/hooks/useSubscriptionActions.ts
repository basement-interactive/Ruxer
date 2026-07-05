// SPDX-License-Identifier: AGPL-3.0-or-later

import {showPremiumActionErrorModal} from '@app/features/app/components/dialogs/components/plutonium/utils/PremiumActionErrorModal';
import {Logger} from '@app/features/platform/utils/AppLogger';
import * as PremiumCommands from '@app/features/premium/commands/PremiumCommands';
import * as ToastCommands from '@app/features/ui/commands/ToastCommands';
import {openExternalUrl} from '@app/features/ui/utils/NativeUtils';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {useCallback, useState} from 'react';

const CUSTOMER_PORTAL_FAILED_TITLE_DESCRIPTOR = msg({
	message: "Couldn't open the billing portal",
	comment: 'Title of the generic fallback error modal shown when opening the billing customer portal fails.',
});
const CUSTOMER_PORTAL_FAILED_MESSAGE_DESCRIPTOR = msg({
	message: 'Something went wrong while opening the billing portal. Please try again in a moment.',
	comment: 'Body of the generic fallback error modal shown when opening the billing customer portal fails.',
});
const YOUR_SUBSCRIPTION_HAS_BEEN_SET_TO_CANCEL_AT_DESCRIPTOR = msg({
	message: 'Your subscription has been set to cancel at the end of your billing period.',
	comment: 'Toast success shown after a Plutonium subscription is set to cancel at the end of the billing period.',
});
const CANCEL_FAILED_TITLE_DESCRIPTOR = msg({
	message: "Couldn't cancel your subscription",
	comment: 'Title of the generic fallback error modal shown when cancelling a Plutonium subscription fails.',
});
const CANCEL_FAILED_MESSAGE_DESCRIPTOR = msg({
	message: 'Something went wrong while cancelling your subscription. Please try again in a moment.',
	comment: 'Body of the generic fallback error modal shown when cancelling a Plutonium subscription fails.',
});
const YOUR_GRACE_PERIOD_HAS_ENDED_DESCRIPTOR = msg({
	message: 'Your grace period has ended.',
	comment: 'Body text in the Plutonium subscription actions. Keep the tone plain and specific.',
});
const END_GRACE_FAILED_TITLE_DESCRIPTOR = msg({
	message: "Couldn't end your grace period",
	comment: 'Title of the generic fallback error modal shown when ending the Plutonium grace period fails.',
});
const END_GRACE_FAILED_MESSAGE_DESCRIPTOR = msg({
	message: 'Something went wrong while ending your grace period. Please try again in a moment.',
	comment: 'Body of the generic fallback error modal shown when ending the Plutonium grace period fails.',
});
const YOUR_SUBSCRIPTION_HAS_BEEN_REACTIVATED_DESCRIPTOR = msg({
	message: 'Your subscription has been reactivated.',
	comment: 'Body text in the Plutonium subscription actions. Keep the tone plain and specific.',
});
const REACTIVATE_FAILED_TITLE_DESCRIPTOR = msg({
	message: "Couldn't reactivate your subscription",
	comment: 'Title of the generic fallback error modal shown when reactivating a Plutonium subscription fails.',
});
const REACTIVATE_FAILED_MESSAGE_DESCRIPTOR = msg({
	message: 'Something went wrong while reactivating your subscription. Please try again in a moment.',
	comment: 'Body of the generic fallback error modal shown when reactivating a Plutonium subscription fails.',
});
const YOUR_SUBSCRIPTION_HAS_BEEN_SWITCHED_TO_YEARLY_BILLING_DESCRIPTOR = msg({
	message: 'Your subscription has been switched to yearly billing.',
	comment: 'Toast success shown after a Plutonium subscription is switched from monthly to yearly billing.',
});
const YOUR_SUBSCRIPTION_HAS_BEEN_SWITCHED_TO_MONTHLY_BILLING_DESCRIPTOR = msg({
	message: 'Your subscription has been switched to monthly billing.',
	comment: 'Toast success shown after a Plutonium subscription is switched from yearly to monthly billing.',
});
const YOUR_SUBSCRIPTION_WILL_SWITCH_TO_YEARLY_BILLING_DESCRIPTOR = msg({
	message: 'Your subscription will switch to yearly billing at the next renewal.',
	comment: 'Toast success shown after a Plutonium subscription is scheduled to switch to yearly billing.',
});
const YOUR_SUBSCRIPTION_WILL_SWITCH_TO_MONTHLY_BILLING_DESCRIPTOR = msg({
	message: 'Your subscription will switch to monthly billing at the next renewal.',
	comment: 'Toast success shown after a Plutonium subscription is scheduled to switch to monthly billing.',
});
const YOUR_PENDING_BILLING_CHANGE_HAS_BEEN_CANCELED_DESCRIPTOR = msg({
	message: 'Your pending billing change has been canceled.',
	comment: 'Toast success shown after a scheduled Plutonium billing cycle change is canceled.',
});
const CHANGE_CYCLE_FAILED_TITLE_DESCRIPTOR = msg({
	message: "Couldn't change your billing cycle",
	comment: 'Title of the generic fallback error modal shown when changing the Plutonium billing cycle fails.',
});
const CHANGE_CYCLE_FAILED_MESSAGE_DESCRIPTOR = msg({
	message: 'Something went wrong while changing your billing cycle. Please try again in a moment.',
	comment: 'Body of the generic fallback error modal shown when changing the Plutonium billing cycle fails.',
});
const CANCEL_PENDING_CHANGE_FAILED_TITLE_DESCRIPTOR = msg({
	message: "Couldn't cancel your pending billing change",
	comment:
		'Title of the generic fallback error modal shown when canceling a scheduled Plutonium billing cycle change fails.',
});
const CANCEL_PENDING_CHANGE_FAILED_MESSAGE_DESCRIPTOR = msg({
	message: 'Something went wrong while canceling your pending billing change. Please try again in a moment.',
	comment:
		'Body of the generic fallback error modal shown when canceling a scheduled Plutonium billing cycle change fails.',
});
const logger = new Logger('useSubscriptionActions');
export const useSubscriptionActions = (countryCode?: string | null) => {
	const {i18n} = useLingui();
	const [loadingPortal, setLoadingPortal] = useState(false);
	const [loadingCancel, setLoadingCancel] = useState(false);
	const [loadingReactivate, setLoadingReactivate] = useState(false);
	const [loadingEndGrace, setLoadingEndGrace] = useState(false);
	const [loadingChangeBillingCycle, setLoadingChangeBillingCycle] = useState<'monthly' | 'yearly' | null>(null);
	const [loadingCancelPendingChange, setLoadingCancelPendingChange] = useState(false);
	const handleOpenCustomerPortal = useCallback(async () => {
		setLoadingPortal(true);
		try {
			const url = await PremiumCommands.createCustomerPortalSession();
			void openExternalUrl(url);
		} catch (error) {
			logger.error('Failed to open customer portal', error);
			showPremiumActionErrorModal(
				error,
				{
					fallbackTitle: CUSTOMER_PORTAL_FAILED_TITLE_DESCRIPTOR,
					fallbackMessage: CUSTOMER_PORTAL_FAILED_MESSAGE_DESCRIPTOR,
				},
				'app.plutonium.use-subscription-actions.open-customer-portal.generic-error-modal',
			);
		} finally {
			setLoadingPortal(false);
		}
	}, [i18n]);
	const handleCancelSubscription = useCallback(async () => {
		setLoadingCancel(true);
		try {
			await PremiumCommands.cancelSubscriptionAtPeriodEnd();
			await PremiumCommands.refreshPremiumState(countryCode ?? undefined);
			ToastCommands.success(i18n._(YOUR_SUBSCRIPTION_HAS_BEEN_SET_TO_CANCEL_AT_DESCRIPTOR));
		} catch (error) {
			logger.error('Failed to cancel subscription', error);
			showPremiumActionErrorModal(
				error,
				{
					fallbackTitle: CANCEL_FAILED_TITLE_DESCRIPTOR,
					fallbackMessage: CANCEL_FAILED_MESSAGE_DESCRIPTOR,
				},
				'app.plutonium.use-subscription-actions.cancel-subscription.generic-error-modal',
			);
		} finally {
			setLoadingCancel(false);
		}
	}, [countryCode, i18n]);
	const handleEndPremiumGracePeriod = useCallback(async () => {
		setLoadingEndGrace(true);
		try {
			await PremiumCommands.endPremiumGracePeriod();
			await PremiumCommands.refreshPremiumState(countryCode ?? undefined);
			ToastCommands.success(i18n._(YOUR_GRACE_PERIOD_HAS_ENDED_DESCRIPTOR));
		} catch (error) {
			logger.error('Failed to end premium grace period', error);
			showPremiumActionErrorModal(
				error,
				{
					fallbackTitle: END_GRACE_FAILED_TITLE_DESCRIPTOR,
					fallbackMessage: END_GRACE_FAILED_MESSAGE_DESCRIPTOR,
				},
				'app.plutonium.use-subscription-actions.end-grace-period.generic-error-modal',
			);
		} finally {
			setLoadingEndGrace(false);
		}
	}, [countryCode, i18n]);
	const handleReactivateSubscription = useCallback(async () => {
		setLoadingReactivate(true);
		try {
			await PremiumCommands.reactivateSubscription();
			await PremiumCommands.refreshPremiumState(countryCode ?? undefined);
			ToastCommands.success(i18n._(YOUR_SUBSCRIPTION_HAS_BEEN_REACTIVATED_DESCRIPTOR));
		} catch (error) {
			logger.error('Failed to reactivate subscription', error);
			showPremiumActionErrorModal(
				error,
				{
					fallbackTitle: REACTIVATE_FAILED_TITLE_DESCRIPTOR,
					fallbackMessage: REACTIVATE_FAILED_MESSAGE_DESCRIPTOR,
				},
				'app.plutonium.use-subscription-actions.reactivate-subscription.generic-error-modal',
			);
		} finally {
			setLoadingReactivate(false);
		}
	}, [countryCode, i18n]);
	const handleChangeSubscriptionBillingCycle = useCallback(
		async (
			billingCycle: 'monthly' | 'yearly',
			effectiveAt: PremiumCommands.SubscriptionBillingCycleChangeEffectiveAt = 'now',
		) => {
			setLoadingChangeBillingCycle(billingCycle);
			try {
				await PremiumCommands.changeSubscriptionBillingCycle(billingCycle, effectiveAt);
				await PremiumCommands.refreshPremiumState(countryCode ?? undefined);
				ToastCommands.success(
					effectiveAt === 'period_end'
						? billingCycle === 'yearly'
							? i18n._(YOUR_SUBSCRIPTION_WILL_SWITCH_TO_YEARLY_BILLING_DESCRIPTOR)
							: i18n._(YOUR_SUBSCRIPTION_WILL_SWITCH_TO_MONTHLY_BILLING_DESCRIPTOR)
						: billingCycle === 'yearly'
							? i18n._(YOUR_SUBSCRIPTION_HAS_BEEN_SWITCHED_TO_YEARLY_BILLING_DESCRIPTOR)
							: i18n._(YOUR_SUBSCRIPTION_HAS_BEEN_SWITCHED_TO_MONTHLY_BILLING_DESCRIPTOR),
				);
			} catch (error) {
				logger.error('Failed to change subscription billing cycle', error);
				showPremiumActionErrorModal(
					error,
					{
						fallbackTitle: CHANGE_CYCLE_FAILED_TITLE_DESCRIPTOR,
						fallbackMessage: CHANGE_CYCLE_FAILED_MESSAGE_DESCRIPTOR,
					},
					'app.plutonium.use-subscription-actions.change-billing-cycle.generic-error-modal',
				);
			} finally {
				setLoadingChangeBillingCycle(null);
			}
		},
		[countryCode, i18n],
	);
	const handleCancelPendingSubscriptionChange = useCallback(async () => {
		setLoadingCancelPendingChange(true);
		try {
			await PremiumCommands.cancelPendingSubscriptionChange();
			await PremiumCommands.refreshPremiumState(countryCode ?? undefined);
			ToastCommands.success(i18n._(YOUR_PENDING_BILLING_CHANGE_HAS_BEEN_CANCELED_DESCRIPTOR));
		} catch (error) {
			logger.error('Failed to cancel pending billing cycle change', error);
			showPremiumActionErrorModal(
				error,
				{
					fallbackTitle: CANCEL_PENDING_CHANGE_FAILED_TITLE_DESCRIPTOR,
					fallbackMessage: CANCEL_PENDING_CHANGE_FAILED_MESSAGE_DESCRIPTOR,
				},
				'app.plutonium.use-subscription-actions.cancel-pending-change.generic-error-modal',
			);
		} finally {
			setLoadingCancelPendingChange(false);
		}
	}, [countryCode, i18n]);
	return {
		loadingPortal,
		loadingCancel,
		loadingReactivate,
		loadingEndGrace,
		loadingChangeBillingCycle,
		loadingCancelPendingChange,
		handleOpenCustomerPortal,
		handleCancelSubscription,
		handleEndPremiumGracePeriod,
		handleReactivateSubscription,
		handleChangeSubscriptionBillingCycle,
		handleCancelPendingSubscriptionChange,
	};
};
