// SPDX-License-Identifier: AGPL-3.0-or-later

import {showGenericErrorModal} from '@app/features/app/components/alerts/GenericErrorModalCommands';
import * as AuthenticationCommands from '@app/features/auth/commands/AuthenticationCommands';
import {VerificationResult} from '@app/features/auth/commands/AuthenticationCommands';
import styles from '@app/features/auth/components/modals/RequiredActionModal.module.css';
import {
	ADD_WORKING_EMAIL_DESCRIPTION_DESCRIPTOR,
	ADD_WORKING_EMAIL_TITLE_DESCRIPTOR,
	CHECK_YOUR_EMAIL_DESCRIPTION_DESCRIPTOR,
	CHECK_YOUR_EMAIL_TITLE_DESCRIPTOR,
	CODE_NOT_REQUESTED_DESCRIPTOR,
	EMAIL_ADDRESS_LABEL_DESCRIPTOR,
	EMAIL_HELP_SELF_SERVE_DESCRIPTION_DESCRIPTOR,
	EMAIL_HELP_SUPPORT_DESCRIPTION_DESCRIPTOR,
	EMAIL_HELP_TITLE_DESCRIPTOR,
	ENTER_EMAIL_CODE_DESCRIPTION_DESCRIPTOR,
	ENTER_EMAIL_CODE_TITLE_DESCRIPTOR,
	ENTER_NEW_EMAIL_DESCRIPTION_DESCRIPTOR,
	ENTER_NEW_EMAIL_TITLE_DESCRIPTOR,
	FAILED_TO_SEND_VERIFICATION_EMAIL_PLEASE_TRY_AGAIN_DESCRIPTOR,
	I_NEED_ANOTHER_WAY_DESCRIPTOR,
	RESEND_CODE_DESCRIPTOR,
	TOO_MANY_REQUESTS_PLEASE_TRY_AGAIN_LATER_DESCRIPTOR,
	USE_DIFFERENT_EMAIL_DESCRIPTOR,
	USE_PHONE_DESCRIPTOR,
	VERIFICATION_CODE_SENT_CHECK_YOUR_NEW_EMAIL_INBOX_DESCRIPTOR,
	VERIFICATION_EMAIL_SENT_PLEASE_CHECK_YOUR_INBOX_DESCRIPTOR,
	YOU_NEED_ACCESS_TO_YOUR_CURRENT_EMAIL_TO_DESCRIPTOR,
	YOUR_EMAIL_ADDRESS_HAS_BEEN_UPDATED_DESCRIPTOR,
	YOUR_NEW_EMAIL_DESCRIPTOR,
} from '@app/features/auth/components/modals/required_action/RequiredActionDescriptors';
import {
	InlineLink,
	NewEmailAddressForm,
	StepShell,
	SupportLinkLine,
	useRequiredActionFormSubmit,
	useResendEmailChangeCode,
	ValueBlock,
	VerificationCodeForm,
} from '@app/features/auth/components/modals/required_action/RequiredActionShared';
import {
	type CodeFormInputs,
	type EmailScreen,
	type NewEmailFormInputs,
	normalizeVerificationCode,
	type SubmitCallback,
} from '@app/features/auth/components/modals/required_action/RequiredActionTypes';
import DeveloperOptions from '@app/features/devtools/state/DeveloperOptions';
import {SOMETHING_WENT_WRONG_DESCRIPTOR} from '@app/features/i18n/utils/CommonMessageDescriptors';
import {Button} from '@app/features/ui/button/Button';
import * as ToastCommands from '@app/features/ui/commands/ToastCommands';
import * as UserCommands from '@app/features/user/commands/UserCommands';
import Users from '@app/features/user/state/Users';
import type {MessageDescriptor} from '@lingui/core';
import {useLingui} from '@lingui/react/macro';
import type React from 'react';
import {useCallback, useEffect, useState} from 'react';
import {type UseFormReturn, useForm} from 'react-hook-form';

interface EmailCheckStepProps {
	userEmail: string | null | undefined;
	onNeedAnotherWay: () => void;
}

export const EmailCheckStep: React.FC<EmailCheckStepProps> = ({userEmail, onNeedAnotherWay}) => {
	const {i18n} = useLingui();
	return (
		<StepShell
			title={i18n._(CHECK_YOUR_EMAIL_TITLE_DESCRIPTOR)}
			description={i18n._(CHECK_YOUR_EMAIL_DESCRIPTION_DESCRIPTOR)}
			data-flx="auth.required-action.required-action-email.email-check-step.step-shell"
		>
			<ValueBlock
				label={i18n._(EMAIL_ADDRESS_LABEL_DESCRIPTOR)}
				value={
					<span className={styles.selectable} data-flx="auth.required-action-modal.email-check-step.email">
						{userEmail ?? i18n._(YOUR_NEW_EMAIL_DESCRIPTOR)}
					</span>
				}
				data-flx="auth.required-action.required-action-email.email-check-step.value-block"
			/>
			<InlineLink onClick={onNeedAnotherWay} data-flx="auth.required-action-modal.email-check-step.inline.email-help">
				{i18n._(I_NEED_ANOTHER_WAY_DESCRIPTOR)}
			</InlineLink>
		</StepShell>
	);
};

interface EmailHelpStepProps {
	canSelfServeEmailRecovery: boolean;
	canUsePhoneRecovery: boolean;
	onUseDifferentEmail: () => void;
	onUsePhone: () => void;
}

export const EmailHelpStep: React.FC<EmailHelpStepProps> = ({
	canSelfServeEmailRecovery,
	canUsePhoneRecovery,
	onUseDifferentEmail,
	onUsePhone,
}) => {
	const {i18n} = useLingui();
	return (
		<StepShell
			title={i18n._(EMAIL_HELP_TITLE_DESCRIPTOR)}
			description={
				canSelfServeEmailRecovery
					? i18n._(EMAIL_HELP_SELF_SERVE_DESCRIPTION_DESCRIPTOR)
					: i18n._(EMAIL_HELP_SUPPORT_DESCRIPTION_DESCRIPTOR)
			}
			data-flx="auth.required-action.required-action-email.email-help-step.step-shell"
		>
			{canSelfServeEmailRecovery || canUsePhoneRecovery ? (
				<div className={styles.choiceGroup} data-flx="auth.required-action-modal.email-help-step.choice-group">
					{canSelfServeEmailRecovery ? (
						<Button
							fitContainer
							onClick={onUseDifferentEmail}
							data-flx="auth.required-action-modal.email-help-step.button.use-different-email"
						>
							{i18n._(USE_DIFFERENT_EMAIL_DESCRIPTOR)}
						</Button>
					) : null}
					{canUsePhoneRecovery ? (
						<Button
							fitContainer
							variant={canSelfServeEmailRecovery ? 'secondary' : 'primary'}
							onClick={onUsePhone}
							data-flx="auth.required-action-modal.email-help-step.button.use-phone"
						>
							{i18n._(USE_PHONE_DESCRIPTOR)}
						</Button>
					) : null}
				</div>
			) : null}
			<div className={styles.supportBlock} data-flx="auth.required-action-modal.email-help-step.support-block">
				<SupportLinkLine data-flx="auth.required-action.required-action-email.email-help-step.support-link-line" />
			</div>
		</StepShell>
	);
};

interface NewEmailStepProps {
	form: UseFormReturn<NewEmailFormInputs>;
	onSubmit: SubmitCallback;
	isBouncedEmail: boolean;
}

export const NewEmailStep: React.FC<NewEmailStepProps> = ({form, onSubmit, isBouncedEmail}) => {
	const {i18n} = useLingui();
	return (
		<NewEmailAddressForm
			form={form}
			onSubmit={onSubmit}
			title={i18n._(isBouncedEmail ? ADD_WORKING_EMAIL_TITLE_DESCRIPTOR : ENTER_NEW_EMAIL_TITLE_DESCRIPTOR)}
			description={i18n._(
				isBouncedEmail ? ADD_WORKING_EMAIL_DESCRIPTION_DESCRIPTOR : ENTER_NEW_EMAIL_DESCRIPTION_DESCRIPTOR,
			)}
			data-flx="auth.required-action.required-action-email.new-email-step.new-email-address-form.submit"
		/>
	);
};

interface EmailCodeStepProps {
	form: UseFormReturn<CodeFormInputs>;
	onSubmit: SubmitCallback;
	recipient: string | null | undefined;
	onResendCode: () => void;
	isResendingCode: boolean;
	isSubmitting: boolean;
}

export const EmailCodeStep: React.FC<EmailCodeStepProps> = ({
	form,
	onSubmit,
	recipient,
	onResendCode,
	isResendingCode,
	isSubmitting,
}) => {
	const {i18n} = useLingui();
	const emailAddress = recipient || i18n._(YOUR_NEW_EMAIL_DESCRIPTOR);
	return (
		<VerificationCodeForm
			form={form}
			onSubmit={onSubmit}
			title={i18n._(ENTER_EMAIL_CODE_TITLE_DESCRIPTOR)}
			description={i18n._(ENTER_EMAIL_CODE_DESCRIPTION_DESCRIPTOR, {emailAddress})}
			data-flx="auth.required-action.required-action-email.email-code-step.verification-code-form.submit"
		>
			<InlineLink
				onClick={onResendCode}
				disabled={isSubmitting}
				submitting={isResendingCode}
				data-flx="auth.required-action-modal.email-code-step.inline.resend"
			>
				{i18n._(RESEND_CODE_DESCRIPTOR)}
			</InlineLink>
		</VerificationCodeForm>
	);
};

export interface EmailVerificationController {
	screen: EmailScreen;
	isEmailResending: boolean;
	emailRecoveryForm: UseFormReturn<NewEmailFormInputs>;
	emailRecoveryCodeForm: UseFormReturn<CodeFormInputs>;
	bouncedEmailForm: UseFormReturn<NewEmailFormInputs>;
	bouncedEmailCodeForm: UseFormReturn<CodeFormInputs>;
	isEmailRecoverySubmitting: boolean;
	isEmailRecoveryCodeSubmitting: boolean;
	isBouncedEmailSubmitting: boolean;
	isBouncedEmailCodeSubmitting: boolean;
	isResendingEmailRecoveryCode: boolean;
	isResendingBouncedEmailCode: boolean;
	onResendEmail: () => Promise<void>;
	onEmailRecoverySubmit: SubmitCallback;
	onEmailRecoveryCodeSubmit: SubmitCallback;
	onBouncedEmailSubmit: SubmitCallback;
	onBouncedEmailCodeSubmit: SubmitCallback;
	onStartEmailRecovery: () => void;
	onUsePhoneRecovery: () => void;
	onBackToRecoveryInstructions: () => void;
	onUseDifferentRecoveryEmail: () => void;
	onUseDifferentBouncedEmail: () => void;
	onResendEmailRecoveryCode: () => void;
	onResendBouncedEmailCode: () => void;
}

interface UseEmailVerificationParams {
	mock: boolean;
	isEmailBounced: boolean;
	resetKey: string | undefined;
	onSwitchToPhoneTab: () => void;
}

export const useEmailVerification = ({
	mock,
	isEmailBounced,
	resetKey,
	onSwitchToPhoneTab,
}: UseEmailVerificationParams): EmailVerificationController => {
	const {i18n} = useLingui();
	const [screen, setScreen] = useState<EmailScreen>({kind: 'email-instructions'});
	const [isResendingEmail, setIsResendingEmail] = useState(false);
	const [isResendingEmailRecoveryCode, setIsResendingEmailRecoveryCode] = useState(false);
	const [isResendingBouncedEmailCode, setIsResendingBouncedEmailCode] = useState(false);
	const emailRecoveryForm = useForm<NewEmailFormInputs>();
	const emailRecoveryCodeForm = useForm<CodeFormInputs>();
	const bouncedEmailForm = useForm<NewEmailFormInputs>();
	const bouncedEmailCodeForm = useForm<CodeFormInputs>();
	const defaultScreen = useCallback(
		(): EmailScreen => (isEmailBounced ? {kind: 'bounced-email-new'} : {kind: 'email-instructions'}),
		[isEmailBounced],
	);
	useEffect(() => {
		if (mock) {
			setScreen({kind: 'email-instructions'});
		} else if (resetKey) {
			setScreen(defaultScreen());
			setIsResendingEmail(false);
			setIsResendingEmailRecoveryCode(false);
			setIsResendingBouncedEmailCode(false);
			emailRecoveryForm.reset();
			emailRecoveryCodeForm.reset();
			bouncedEmailForm.reset();
			bouncedEmailCodeForm.reset();
		}
	}, [mock, resetKey, defaultScreen, emailRecoveryForm, emailRecoveryCodeForm, bouncedEmailForm, bouncedEmailCodeForm]);
	const setMissingVerificationCodeError = useCallback(
		(form: UseFormReturn<CodeFormInputs>) => {
			form.setError('code', {message: i18n._(CODE_NOT_REQUESTED_DESCRIPTOR)});
		},
		[i18n],
	);
	const onBouncedEmailSubmit = useCallback(
		async (data: NewEmailFormInputs) => {
			const result = await UserCommands.requestBouncedEmailChangeNew(data.newEmail);
			setScreen({kind: 'bounced-email-code', recipient: result.new_email, ticket: result.ticket});
			bouncedEmailCodeForm.reset();
			ToastCommands.success(i18n._(VERIFICATION_CODE_SENT_CHECK_YOUR_NEW_EMAIL_INBOX_DESCRIPTOR));
		},
		[bouncedEmailCodeForm, i18n],
	);
	const onBouncedEmailCodeSubmit = useCallback(
		async (data: CodeFormInputs) => {
			if (screen.kind !== 'bounced-email-code') {
				setMissingVerificationCodeError(bouncedEmailCodeForm);
				return;
			}
			const updatedUser = await UserCommands.verifyBouncedEmailChangeNew(
				screen.ticket,
				normalizeVerificationCode(data.code),
			);
			Users.handleUserUpdate(updatedUser, {clearMissingOptionalFields: true});
			ToastCommands.success(i18n._(YOUR_EMAIL_ADDRESS_HAS_BEEN_UPDATED_DESCRIPTOR));
		},
		[bouncedEmailCodeForm, screen, setMissingVerificationCodeError, i18n],
	);
	const onEmailRecoverySubmit = useCallback(
		async (data: NewEmailFormInputs) => {
			let activeTicket = screen.kind === 'email-recovery-code' ? screen.ticket : null;
			let activeProof = screen.kind === 'email-recovery-code' ? screen.proof : null;
			if (!activeTicket || !activeProof) {
				const startResult = await UserCommands.startEmailChange();
				if (startResult.require_original || !startResult.original_proof) {
					emailRecoveryForm.setError('newEmail', {
						type: 'server',
						message: i18n._(YOU_NEED_ACCESS_TO_YOUR_CURRENT_EMAIL_TO_DESCRIPTOR),
					});
					return;
				}
				activeTicket = startResult.ticket;
				activeProof = startResult.original_proof;
			}
			const result = await UserCommands.requestEmailChangeNew(activeTicket, data.newEmail, activeProof);
			setScreen({
				kind: 'email-recovery-code',
				recipient: result.new_email,
				ticket: result.ticket,
				proof: activeProof,
			});
			emailRecoveryCodeForm.reset();
			ToastCommands.success(i18n._(VERIFICATION_CODE_SENT_CHECK_YOUR_NEW_EMAIL_INBOX_DESCRIPTOR));
		},
		[emailRecoveryCodeForm, emailRecoveryForm, screen, i18n],
	);
	const onEmailRecoveryCodeSubmit = useCallback(
		async (data: CodeFormInputs) => {
			if (screen.kind !== 'email-recovery-code') {
				setMissingVerificationCodeError(emailRecoveryCodeForm);
				return;
			}
			const {email_token} = await UserCommands.verifyEmailChangeNew(
				screen.ticket,
				normalizeVerificationCode(data.code),
				screen.proof,
			);
			const updatedUser = await UserCommands.applyEmailChange(email_token);
			Users.handleUserUpdate(updatedUser, {clearMissingOptionalFields: true});
			ToastCommands.success(i18n._(YOUR_EMAIL_ADDRESS_HAS_BEEN_UPDATED_DESCRIPTOR));
		},
		[emailRecoveryCodeForm, screen, setMissingVerificationCodeError, i18n],
	);
	const {handleSubmit: handleBouncedEmailSubmit, isSubmitting: isBouncedEmailSubmitting} = useRequiredActionFormSubmit(
		bouncedEmailForm,
		onBouncedEmailSubmit,
		'newEmail',
		'email-address',
	);
	const {handleSubmit: handleEmailRecoverySubmit, isSubmitting: isEmailRecoverySubmitting} =
		useRequiredActionFormSubmit(emailRecoveryForm, onEmailRecoverySubmit, 'newEmail', 'email-address');
	const {handleSubmit: handleEmailRecoveryCodeSubmit, isSubmitting: isEmailRecoveryCodeSubmitting} =
		useRequiredActionFormSubmit(emailRecoveryCodeForm, onEmailRecoveryCodeSubmit, 'code', 'email-code');
	const {handleSubmit: handleBouncedEmailCodeSubmit, isSubmitting: isBouncedEmailCodeSubmitting} =
		useRequiredActionFormSubmit(bouncedEmailCodeForm, onBouncedEmailCodeSubmit, 'code', 'email-code');
	const onResendEmail = useCallback(async () => {
		const showResendErrorModal = (message: MessageDescriptor) => {
			showGenericErrorModal({
				title: () => i18n._(SOMETHING_WENT_WRONG_DESCRIPTOR),
				message: () => i18n._(message),
				dataFlx: 'auth.required-action-email.resend-error-modal',
			});
		};
		if (mock) {
			const outcome = DeveloperOptions.mockRequiredActionsResendOutcome;
			switch (outcome) {
				case 'success':
					ToastCommands.success(i18n._(VERIFICATION_EMAIL_SENT_PLEASE_CHECK_YOUR_INBOX_DESCRIPTOR));
					break;
				case 'rate_limited':
					showResendErrorModal(TOO_MANY_REQUESTS_PLEASE_TRY_AGAIN_LATER_DESCRIPTOR);
					break;
				case 'server_error':
					showResendErrorModal(FAILED_TO_SEND_VERIFICATION_EMAIL_PLEASE_TRY_AGAIN_DESCRIPTOR);
					break;
			}
			return;
		}
		if (isResendingEmail) return;
		setIsResendingEmail(true);
		try {
			const result = await AuthenticationCommands.resendVerificationEmail();
			switch (result) {
				case VerificationResult.SUCCESS:
					ToastCommands.success(i18n._(VERIFICATION_EMAIL_SENT_PLEASE_CHECK_YOUR_INBOX_DESCRIPTOR));
					break;
				case VerificationResult.RATE_LIMITED:
					showResendErrorModal(TOO_MANY_REQUESTS_PLEASE_TRY_AGAIN_LATER_DESCRIPTOR);
					break;
				case VerificationResult.SERVER_ERROR:
				case VerificationResult.EXPIRED_TOKEN:
					showResendErrorModal(FAILED_TO_SEND_VERIFICATION_EMAIL_PLEASE_TRY_AGAIN_DESCRIPTOR);
					break;
			}
		} finally {
			setIsResendingEmail(false);
		}
	}, [i18n, isResendingEmail, mock]);
	const resendEmailChangeCode = useResendEmailChangeCode();
	const onResendBouncedEmailCode = useCallback(() => {
		const ticket = screen.kind === 'bounced-email-code' ? screen.ticket : null;
		return resendEmailChangeCode(
			ticket,
			isResendingBouncedEmailCode,
			setIsResendingBouncedEmailCode,
			UserCommands.resendBouncedEmailChangeNew,
		);
	}, [screen, isResendingBouncedEmailCode, resendEmailChangeCode]);
	const onResendEmailRecoveryCode = useCallback(() => {
		const ticket = screen.kind === 'email-recovery-code' ? screen.ticket : null;
		return resendEmailChangeCode(
			ticket,
			isResendingEmailRecoveryCode,
			setIsResendingEmailRecoveryCode,
			UserCommands.resendEmailChangeNew,
		);
	}, [screen, isResendingEmailRecoveryCode, resendEmailChangeCode]);
	const onStartEmailRecovery = useCallback(() => {
		setScreen({kind: 'email-recovery-new'});
	}, []);
	const onBackToRecoveryInstructions = useCallback(() => {
		setScreen({kind: 'email-instructions'});
		emailRecoveryForm.reset();
	}, [emailRecoveryForm]);
	const onUseDifferentRecoveryEmail = useCallback(() => {
		setScreen({kind: 'email-recovery-new'});
		emailRecoveryCodeForm.reset();
	}, [emailRecoveryCodeForm]);
	const onUseDifferentBouncedEmail = useCallback(() => {
		setScreen({kind: 'bounced-email-new'});
		bouncedEmailCodeForm.reset();
	}, [bouncedEmailCodeForm]);
	const isEmailResending = mock ? DeveloperOptions.mockRequiredActionsResending : isResendingEmail;
	return {
		screen,
		isEmailResending,
		emailRecoveryForm,
		emailRecoveryCodeForm,
		bouncedEmailForm,
		bouncedEmailCodeForm,
		isEmailRecoverySubmitting,
		isEmailRecoveryCodeSubmitting,
		isBouncedEmailSubmitting,
		isBouncedEmailCodeSubmitting,
		isResendingEmailRecoveryCode,
		isResendingBouncedEmailCode,
		onResendEmail,
		onEmailRecoverySubmit: handleEmailRecoverySubmit,
		onEmailRecoveryCodeSubmit: handleEmailRecoveryCodeSubmit,
		onBouncedEmailSubmit: handleBouncedEmailSubmit,
		onBouncedEmailCodeSubmit: handleBouncedEmailCodeSubmit,
		onStartEmailRecovery,
		onUsePhoneRecovery: onSwitchToPhoneTab,
		onBackToRecoveryInstructions,
		onUseDifferentRecoveryEmail,
		onUseDifferentBouncedEmail,
		onResendEmailRecoveryCode,
		onResendBouncedEmailCode,
	};
};
