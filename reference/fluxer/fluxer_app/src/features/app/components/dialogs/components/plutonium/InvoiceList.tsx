// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/app/components/dialogs/components/plutonium/InvoiceList.module.css';
import statusStyles from '@app/features/app/components/dialogs/components/plutonium/PurchaseHistoryStatus.module.css';
import {formatMinorUnitPrice} from '@app/features/premium/utils/PricingUtils';
import {Button} from '@app/features/ui/button/Button';
import {openExternalUrl} from '@app/features/ui/utils/NativeUtils';
import {getCurrentLocale} from '@app/features/user/utils/LocaleUtils';
import {getFormattedShortDate} from '@fluxer/date_utils/src/DateFormatting';
import type {PremiumBillingInvoiceResponse} from '@fluxer/schema/src/domains/premium/PremiumSchemas';
import type {I18n} from '@lingui/core';
import {msg} from '@lingui/core/macro';
import {Trans, useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';

const PAID_DESCRIPTOR = msg({
	message: 'Paid',
	comment: 'Billing invoice status for a completed invoice.',
});
const OPEN_DESCRIPTOR = msg({
	message: 'Open',
	comment: 'Billing invoice status for an invoice awaiting payment.',
});
const DRAFT_DESCRIPTOR = msg({
	message: 'Draft',
	comment: 'Billing invoice status for an invoice not finalized yet.',
});
const VOID_DESCRIPTOR = msg({
	message: 'Void',
	comment: 'Billing invoice status for an invoice canceled before payment.',
});
const UNCOLLECTIBLE_DESCRIPTOR = msg({
	message: 'Uncollectible',
	comment: 'Billing invoice status for an invoice marked as uncollectible.',
});
const INVOICE_DESCRIPTOR = msg({
	message: 'Invoice',
	comment: 'Fallback label when billing invoice status is unknown.',
});
const UNKNOWN_DATE_DESCRIPTOR = msg({
	message: 'Unknown date',
	comment: 'Fallback date value for a billing invoice without a timestamp.',
});
const OPEN_INVOICE_DESCRIPTOR = msg({
	message: 'Open invoice {invoiceLabel}',
	comment: 'Accessible label for opening a specific billing invoice.',
});

function formatInvoiceDate(invoice: PremiumBillingInvoiceResponse): string | null {
	const source = invoice.paid_at ?? invoice.created_at;
	if (!source) return null;
	const date = new Date(source);
	if (Number.isNaN(date.getTime())) return null;
	return getFormattedShortDate(date, getCurrentLocale());
}

function formatInvoiceAmount(invoice: PremiumBillingInvoiceResponse): string {
	const formattedAmount = formatMinorUnitPrice(
		invoice.amount_paid || invoice.amount_due,
		invoice.currency,
		getCurrentLocale(),
	);
	return formattedAmount ?? '';
}

function getInvoiceDateLabel(i18n: I18n, invoice: PremiumBillingInvoiceResponse): string {
	const formattedDate = formatInvoiceDate(invoice);
	return formattedDate ?? i18n._(UNKNOWN_DATE_DESCRIPTOR);
}

function getInvoiceStatusClass(status: string | null): string {
	switch (status) {
		case 'paid':
			return statusStyles.success;
		case 'open':
		case 'draft':
			return statusStyles.pending;
		case 'void':
		case 'uncollectible':
			return statusStyles.muted;
		default:
			return statusStyles.neutral;
	}
}

interface InvoiceListProps {
	invoices: ReadonlyArray<PremiumBillingInvoiceResponse>;
}

export const InvoiceList: React.FC<InvoiceListProps> = observer(({invoices}) => {
	const {i18n} = useLingui();
	const formatInvoiceStatus = (status: string | null): string => {
		switch (status) {
			case 'paid':
				return i18n._(PAID_DESCRIPTOR);
			case 'open':
				return i18n._(OPEN_DESCRIPTOR);
			case 'draft':
				return i18n._(DRAFT_DESCRIPTOR);
			case 'void':
				return i18n._(VOID_DESCRIPTOR);
			case 'uncollectible':
				return i18n._(UNCOLLECTIBLE_DESCRIPTOR);
			default:
				return status ?? i18n._(INVOICE_DESCRIPTOR);
		}
	};
	if (invoices.length === 0) {
		return (
			<p className={styles.empty} data-flx="app.plutonium.invoice-list.empty">
				<Trans comment="Quiet empty state when no invoices exist yet.">No invoices yet.</Trans>
			</p>
		);
	}
	return (
		<div className={styles.list} data-flx="app.plutonium.invoice-list.list">
			<div className={styles.header} data-flx="app.plutonium.invoice-list.header">
				<span data-flx="app.plutonium.invoice-list.span">
					<Trans comment="Column header for invoice payment or creation date.">Date</Trans>
				</span>
				<span data-flx="app.plutonium.invoice-list.span--2">
					<Trans comment="Column header for invoice amount.">Amount</Trans>
				</span>
				<span data-flx="app.plutonium.invoice-list.span--3">
					<Trans comment="Column header for billing invoice status.">Status</Trans>
				</span>
				<span data-flx="app.plutonium.invoice-list.span--4">
					<Trans comment="Column header for opening a billing receipt or invoice.">Receipt</Trans>
				</span>
			</div>
			{invoices.map((invoice) => {
				const invoiceDate = getInvoiceDateLabel(i18n, invoice);
				const amount = formatInvoiceAmount(invoice);
				const invoiceUrl = invoice.hosted_invoice_url ?? invoice.invoice_pdf;
				const invoiceLabel = invoice.number ?? invoice.id;
				return (
					<div className={styles.row} key={invoice.id} data-flx="app.plutonium.invoice-list.row">
						<span className={styles.date} data-flx="app.plutonium.invoice-list.date">
							{invoiceDate}
						</span>
						<span className={styles.amount} data-flx="app.plutonium.invoice-list.amount">
							{amount}
						</span>
						<span className={getInvoiceStatusClass(invoice.status)} data-flx="app.plutonium.invoice-list.span--5">
							{formatInvoiceStatus(invoice.status)}
						</span>
						<Button
							variant="secondary"
							superCompact
							fitContent
							disabled={!invoiceUrl}
							aria-label={i18n._(OPEN_INVOICE_DESCRIPTOR, {invoiceLabel})}
							onClick={() => {
								if (invoiceUrl) void openExternalUrl(invoiceUrl);
							}}
							data-flx="app.plutonium.invoice-list.button"
						>
							<Trans comment="Short button that opens a billing invoice or receipt.">Open</Trans>
						</Button>
					</div>
				);
			})}
		</div>
	);
});
