// SPDX-License-Identifier: AGPL-3.0-or-later

import {msg} from '@lingui/core/macro';

export const BUY_GIFT_DESCRIPTOR = msg({
	message: 'Buy gift',
	comment: 'Checkout button for buying a gift subscription.',
});
export const ONE_TIME_PURCHASE_DESCRIPTOR = msg({
	message: 'one-time purchase',
	comment: 'Billing cadence label for gift purchases that do not renew.',
});
export const MANAGE_SUBSCRIPTION_DESCRIPTOR = msg({
	message: 'Manage subscription',
	comment: 'Billing action that opens subscription management or the customer billing portal.',
});
export const CLAIM_ACCOUNT_TO_PURCHASE_PREMIUM_DESCRIPTOR = msg({
	message: 'Claim your account to purchase {premiumProductFullName}.',
	comment:
		'Billing tooltip shown when an unclaimed account cannot start premium checkout. premiumProductFullName is the full paid product name.',
});
export const CLAIM_ACCOUNT_TO_PURCHASE_OR_REDEEM_PREMIUM_DESCRIPTOR = msg({
	message: 'Claim your account to purchase or redeem {premiumProductFullName}.',
	comment:
		'Billing tooltip shown when an unclaimed account cannot buy or redeem premium. premiumProductFullName is the full paid product name.',
});
export const VERIFY_EMAIL_TO_PURCHASE_PREMIUM_DESCRIPTOR = msg({
	message: 'Verify your email to purchase {premiumProductFullName}.',
	comment:
		'Billing tooltip shown when an unverified account cannot start premium checkout. premiumProductFullName is the full paid product name.',
});
export const FREE_VS_PREMIUM_DESCRIPTOR = msg({
	message: 'Free vs {premiumProductName}',
	comment: 'Premium plan comparison section title. premiumProductName is the short paid product name.',
});
export const GIFT_PREMIUM_DESCRIPTOR = msg({
	message: 'Gift {premiumProductName}',
	comment: 'Premium gift purchase section title. premiumProductName is the short paid product name.',
});
export const SHARE_PREMIUM_EXPERIENCE_DESCRIPTOR = msg({
	message: 'Share the {premiumProductName} experience with your friends by purchasing a gift subscription.',
	comment: 'Description in the premium gift purchase section. premiumProductName is the short paid product name.',
});
export const VIEW_PREMIUM_PERKS_DESCRIPTOR = msg({
	message: 'Scroll down to view all the perks included with {premiumProductName}',
	comment: 'Prompt below premium pricing cards. premiumProductName is the short paid product name.',
});
export const PREMIUM_UPSELL_BANNER_DESCRIPTOR = msg({
	message: 'Get {premiumProductName} for yourself and unlock higher limits and exclusive features.',
	comment: 'Premium upsell banner body. premiumProductName is the short paid product name.',
});
export const PREMIUM_SUBSCRIPTION_DESCRIPTOR = msg({
	message: '{premiumProductName} subscription',
	comment: 'Premium subscription card title. premiumProductName is the short paid product name.',
});
export const VIEW_PLANS_DESCRIPTOR = msg({
	message: 'View plans',
	comment: 'Button in a premium upsell banner that opens available paid plans.',
});
