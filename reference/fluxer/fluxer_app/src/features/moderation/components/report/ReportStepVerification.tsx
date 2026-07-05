// SPDX-License-Identifier: AGPL-3.0-or-later

import {EXAMPLE_VERIFICATION_CODE} from '@app/features/app/config/I18nDisplayConstants';
import {VERIFICATION_CODE_DESCRIPTOR} from '@app/features/i18n/utils/CommonMessageDescriptors';
import styles from '@app/features/moderation/components/pages/ReportPage.module.css';
import {Button} from '@app/features/ui/button/Button';
import {Input} from '@app/features/ui/components/form/FormInput';
import {Trans, useLingui} from '@lingui/react/macro';
import type React from 'react';

interface Props {
	email: string;
	verificationCode: string;
	errorMessage: string | null;
	isVerifying: boolean;
	isResending: boolean;
	resendCooldownSeconds: number;
	onChangeEmail: () => void;
	onResend: () => void;
	onVerify: () => void;
	onCodeChange: (value: string) => void;
	onStartOver: () => void;
}

export const ReportStepVerification: React.FC<Props> = ({
	email,
	verificationCode,
	errorMessage,
	isVerifying,
	isResending,
	resendCooldownSeconds,
	onChangeEmail,
	onResend,
	onVerify,
	onCodeChange,
	onStartOver,
}) => {
	const {i18n} = useLingui();
	const codeForValidation = verificationCode.trim().toUpperCase();
	const codeLooksValid = /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(codeForValidation);
	return (
		<div className={styles.card} data-flx="moderation.report.report-step-verification.card">
			<header className={styles.cardHeader} data-flx="moderation.report.report-step-verification.card-header">
				<p className={styles.eyebrow} data-flx="moderation.report.report-step-verification.eyebrow">
					<Trans>Step 3</Trans>
				</p>
				<h1 className={styles.title} data-flx="moderation.report.report-step-verification.title">
					<Trans>Enter verification code</Trans>
				</h1>
				<p className={styles.description} data-flx="moderation.report.report-step-verification.description">
					<Trans>We sent a code to {email}.</Trans>
				</p>
			</header>
			<div className={styles.cardBody} data-flx="moderation.report.report-step-verification.card-body">
				{errorMessage && (
					<div
						className={styles.errorBox}
						role="alert"
						aria-live="polite"
						data-flx="moderation.report.report-step-verification.error-box"
					>
						{errorMessage}
					</div>
				)}
				<form
					className={styles.form}
					onSubmit={(e) => {
						e.preventDefault();
						onVerify();
					}}
					data-flx="moderation.report.report-step-verification.form.prevent-default"
				>
					<Input
						label={i18n._(VERIFICATION_CODE_DESCRIPTOR)}
						type="text"
						value={verificationCode}
						onChange={(e) => onCodeChange(e.target.value)}
						placeholder={EXAMPLE_VERIFICATION_CODE}
						autoComplete="one-time-code"
						data-flx="moderation.report.report-step-verification.input.code-change.text"
					/>
					<div className={styles.actionRow} data-flx="moderation.report.report-step-verification.action-row">
						<Button
							fitContent
							type="submit"
							disabled={!codeLooksValid || isVerifying}
							submitting={isVerifying}
							className={styles.actionButton}
							data-flx="moderation.report.report-step-verification.action-button.submit"
						>
							<Trans>Verify code</Trans>
						</Button>
						<Button
							variant="secondary"
							fitContent
							type="button"
							onClick={onResend}
							disabled={isResending || isVerifying || resendCooldownSeconds > 0}
							submitting={isResending}
							data-flx="moderation.report.report-step-verification.button.resend"
						>
							{resendCooldownSeconds > 0 ? (
								<Trans>Resend ({resendCooldownSeconds}s)</Trans>
							) : (
								<Trans>Resend code</Trans>
							)}
						</Button>
					</div>
				</form>
			</div>
			<footer className={styles.footerLinks} data-flx="moderation.report.report-step-verification.footer-links">
				<p className={styles.linkRow} data-flx="moderation.report.report-step-verification.link-row">
					<button
						type="button"
						className={styles.linkButton}
						onClick={onChangeEmail}
						data-flx="moderation.report.report-step-verification.link-button.change-email"
					>
						<Trans>Change email</Trans>
					</button>
					<span
						aria-hidden="true"
						className={styles.linkSeparator}
						data-flx="moderation.report.report-step-verification.link-separator"
					>
						·
					</span>
					<button
						type="button"
						className={styles.linkButton}
						onClick={onStartOver}
						data-flx="moderation.report.report-step-verification.link-button.start-over"
					>
						<Trans>Start over</Trans>
					</button>
				</p>
			</footer>
		</div>
	);
};
