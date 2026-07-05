// SPDX-License-Identifier: AGPL-3.0-or-later

import {z} from 'zod';

const AdminPaymentRefundResponse = z.object({
	id: z.string(),
	amount_cents: z.number(),
	currency: z.string(),
	status: z.string().nullable(),
	reason: z.string().nullable(),
	created: z.number(),
	payment_intent_id: z.string().nullable(),
	charge_id: z.string().nullable(),
});

const AdminPaymentResponse = z.object({
	checkout_session_id: z.string().nullable(),
	user_id: z.string(),
	stripe_customer_id: z.string().nullable(),
	payment_intent_id: z.string().nullable(),
	resolved_payment_intent_id: z.string().nullable(),
	charge_id: z.string().nullable(),
	subscription_id: z.string().nullable(),
	invoice_id: z.string().nullable(),
	price_id: z.string().nullable(),
	product_type: z.string().nullable(),
	amount_cents: z.number(),
	currency: z.string(),
	status: z.string(),
	stripe_source: z.enum(['invoice']),
	refundable_via_payment_intent: z.boolean(),
	refunded_amount_cents: z.number(),
	net_amount_cents: z.number(),
	refunds: z.array(AdminPaymentRefundResponse),
	payment_method_type: z.string().nullable(),
	payment_method_brand: z.string().nullable(),
	payment_method_last4: z.string().nullable(),
	stripe_payment_method_country_code: z.string().nullable(),
	stripe_billing_country_code: z.string().nullable(),
	stripe_customer_country_code: z.string().nullable(),
	stripe_terms_of_service_accepted: z.boolean().nullable(),
	is_gift: z.boolean(),
	gift_code: z.string().nullable(),
	purchase_geoip_country_code: z.string().nullable(),
	purchase_client_country_code: z.string().nullable(),
	eu_withdrawal_waiver_required: z.boolean(),
	eu_withdrawal_waiver_accepted: z.boolean(),
	eu_withdrawal_waiver_accepted_at: z.string().nullable(),
	eu_withdrawal_waiver_text_version: z.string().nullable(),
	created_at: z.string(),
	completed_at: z.string().nullable(),
});

export const AdminPaymentListResponse = z.object({
	payments: z.array(AdminPaymentResponse),
});

export type AdminPaymentListResponse = z.infer<typeof AdminPaymentListResponse>;

export const AdminSubscriptionResponse = z.object({
	id: z.string(),
	status: z.string(),
	current_period_start: z.string().nullable(),
	current_period_end: z.string().nullable(),
	cancel_at_period_end: z.boolean(),
	cancel_at: z.string().nullable(),
	canceled_at: z.string().nullable(),
	plan_interval: z.string().nullable(),
	plan_amount_cents: z.number().nullable(),
	plan_currency: z.string().nullable(),
	default_payment_method_id: z.string().nullable(),
});

export type AdminSubscriptionResponse = z.infer<typeof AdminSubscriptionResponse>;

const AdminPaymentMethodResponse = z.object({
	id: z.string(),
	type: z.string(),
	card_brand: z.string().nullable(),
	card_last4: z.string().nullable(),
	card_exp_month: z.number().nullable(),
	card_exp_year: z.number().nullable(),
	created: z.number(),
});

export const AdminPaymentMethodListResponse = z.object({
	payment_methods: z.array(AdminPaymentMethodResponse),
});

export type AdminPaymentMethodListResponse = z.infer<typeof AdminPaymentMethodListResponse>;

const AdminInvoiceResponse = z.object({
	id: z.string(),
	amount_due: z.number(),
	amount_paid: z.number(),
	currency: z.string(),
	status: z.string().nullable(),
	created: z.number(),
	billing_reason: z.string().nullable(),
	subscription_id: z.string().nullable(),
	payment_type: z.string().nullable(),
	payment_status: z.string().nullable(),
	payment_intent_id: z.string().nullable(),
	charge_id: z.string().nullable(),
	paid_at: z.string().nullable(),
	hosted_invoice_url: z.string().nullable(),
	invoice_pdf: z.string().nullable(),
});

export const AdminInvoiceListResponse = z.object({
	invoices: z.array(AdminInvoiceResponse),
	has_more: z.boolean(),
});

export type AdminInvoiceListResponse = z.infer<typeof AdminInvoiceListResponse>;

export const AdminBillingRefundRequest = z.object({
	payment_intent_id: z.string(),
	amount_cents: z.number().int().positive().optional(),
	reason: z.string().trim().min(1).max(512).optional(),
});

export type AdminBillingRefundRequest = z.infer<typeof AdminBillingRefundRequest>;

export const AdminBillingRefundLatestInvoiceCancelRequest = z.object({
	reason: z.string().trim().min(1).max(512).optional(),
});

export type AdminBillingRefundLatestInvoiceCancelRequest = z.infer<typeof AdminBillingRefundLatestInvoiceCancelRequest>;

export const AdminBillingCancelImmediatelyRequest = z.object({
	reason: z.string().trim().min(1).max(512).optional(),
});

export type AdminBillingCancelImmediatelyRequest = z.infer<typeof AdminBillingCancelImmediatelyRequest>;

export const AdminBillingRefundLatestInvoiceCancelResponse = z.object({
	subscription_id: z.string(),
	invoice_id: z.string(),
	payment_intent_id: z.string().nullable(),
	charge_id: z.string().nullable(),
	refund_policy: z.enum(['full_refund', 'prorated_refund', 'cancel_only']),
	refund_policy_basis: z.enum(['support_policy', 'eu_eea_withdrawal_no_waiver']),
	refund_id: z.string().nullable(),
	refunded_amount_cents: z.number(),
	invoice_amount_paid_cents: z.number(),
	currency: z.string(),
	cycle_elapsed_days: z.number(),
	purchase_geoip_country_code: z.string().nullable(),
	purchase_client_country_code: z.string().nullable(),
	stripe_payment_method_country_code: z.string().nullable(),
	stripe_billing_country_code: z.string().nullable(),
	stripe_customer_country_code: z.string().nullable(),
	stripe_terms_of_service_accepted: z.boolean().nullable(),
	eu_withdrawal_waiver_required: z.boolean(),
	eu_withdrawal_waiver_accepted: z.boolean(),
	eu_withdrawal_waiver_accepted_at: z.string().nullable(),
	eu_withdrawal_waiver_text_version: z.string().nullable(),
});

export type AdminBillingRefundLatestInvoiceCancelResponse = z.infer<
	typeof AdminBillingRefundLatestInvoiceCancelResponse
>;

export const AdminBillingOverviewResponse = z.object({
	subscription: AdminSubscriptionResponse.nullable(),
	payments: z.array(AdminPaymentResponse),
	payment_methods: z.array(AdminPaymentMethodResponse),
	stripe_customer_id: z.string().nullable(),
});

export type AdminBillingOverviewResponse = z.infer<typeof AdminBillingOverviewResponse>;
