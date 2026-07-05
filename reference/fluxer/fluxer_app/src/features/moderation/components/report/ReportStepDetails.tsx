// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	EXAMPLE_INVITE_CODE,
	EXAMPLE_MESSAGE_LINK,
	EXAMPLE_REPORT_USER_TAG,
	EXAMPLE_USERNAME_TAG,
} from '@app/features/app/config/I18nDisplayConstants';
import styles from '@app/features/moderation/components/pages/ReportPage.module.css';
import type {FormValues, ReportType} from '@app/features/moderation/components/report/ReportTypes';
import {Button} from '@app/features/ui/button/Button';
import {Combobox, type ComboboxOption} from '@app/features/ui/components/form/FormCombobox';
import {Input, Textarea} from '@app/features/ui/components/form/FormInput';
import {msg} from '@lingui/core/macro';
import {Trans, useLingui} from '@lingui/react/macro';
import type React from 'react';

const VIOLATION_CATEGORY_DESCRIPTOR = msg({
	message: 'Violation category',
	comment:
		'Field label on the details step of the DSA illegal-content report form. The category dropdown narrows the type of violation. Legal/sensitive flow; keep tone formal.',
});
const MESSAGE_LINK_DESCRIPTOR = msg({
	message: 'Message link',
	comment:
		'Field label on the details step of the DSA report form (message report). The reporter pastes a direct link to the offending message.',
});
const REPORTED_USER_TAG_OPTIONAL_DESCRIPTOR = msg({
	message: 'Reported user tag (optional)',
	comment:
		'Field label on the details step of the DSA report form (message report). Optional FluxerTag of the user who sent the message.',
});
const USER_ID_OPTIONAL_DESCRIPTOR = msg({
	message: 'User ID (optional)',
	comment:
		'Field label on the details step of the DSA report form (user report). Optional Fluxer user snowflake ID. "ID" is conventional.',
});
const USER_TAG_OPTIONAL_DESCRIPTOR = msg({
	message: 'User tag (optional)',
	comment:
		'Field label on the details step of the DSA report form (user report). Optional FluxerTag of the reported user.',
});
const COMMUNITY_ID_DESCRIPTOR = msg({
	message: 'Community ID',
	comment:
		"Field label on the details step of the DSA report form (community report). The reported community's snowflake ID.",
});
const INVITE_CODE_OPTIONAL_DESCRIPTOR = msg({
	message: 'Invite code (optional)',
	comment:
		'Field label on the details step of the DSA report form (community report). Optional invite code to the reported community.',
});
const FULL_LEGAL_NAME_DESCRIPTOR = msg({
	message: 'Full legal name',
	comment:
		'Field label on the details step of the DSA report form. Required legal name of the reporter for the formal declaration. Sensitive PII; keep tone neutral.',
});
const FIRST_AND_LAST_NAME_DESCRIPTOR = msg({
	message: 'First and last name',
	comment: 'Placeholder in the Full legal name input on the DSA report form.',
});
const COUNTRY_OF_RESIDENCE_DESCRIPTOR = msg({
	message: 'Country of residence',
	comment:
		'Field label on the details step of the DSA report form. The country where the reporter resides, used for the legal declaration.',
});
const YOUR_USERNAME_OPTIONAL_DESCRIPTOR = msg({
	message: 'Your username (optional)',
	comment:
		'Field label on the details step of the DSA report form. Optional Fluxer username of the reporter so staff can follow up.',
});
const ADDITIONAL_COMMENTS_OPTIONAL_DESCRIPTOR = msg({
	message: 'Additional comments (optional)',
	comment:
		'Field label on the details step of the DSA report form. Optional free-text context the reporter wants staff to see.',
});
const DESCRIBE_WHAT_MAKES_THE_CONTENT_ILLEGAL_DESCRIPTOR = msg({
	message: 'Describe what makes the content illegal',
	comment:
		'Placeholder in the Additional comments textarea on the DSA report form. Prompts the reporter to explain why the content is illegal.',
});

interface Props {
	selectedType: ReportType;
	formValues: FormValues;
	categoryOptions: Array<ComboboxOption<string>>;
	countryOptions: Array<ComboboxOption<string>>;
	fieldErrors: Partial<Record<keyof FormValues, string>>;
	errorMessage: string | null;
	canSubmit: boolean;
	isSubmitting: boolean;
	onFieldChange: (field: keyof FormValues, value: string) => void;
	onSubmit: () => void;
	onStartOver: () => void;
	onBack: () => void;
	messageLinkOk: boolean;
	userTargetOk: boolean;
	guildTargetOk: boolean;
}

export const ReportStepDetails: React.FC<Props> = ({
	selectedType,
	formValues,
	categoryOptions,
	countryOptions,
	fieldErrors,
	errorMessage,
	canSubmit,
	isSubmitting,
	onFieldChange,
	onSubmit,
	onStartOver,
	onBack,
	messageLinkOk,
	userTargetOk,
	guildTargetOk,
}) => {
	const {i18n} = useLingui();
	const hasFieldErrors = Object.values(fieldErrors).some((value) => Boolean(value));
	const showGeneralError = Boolean(errorMessage && !hasFieldErrors);
	return (
		<div className={styles.card} data-flx="moderation.report.report-step-details.card">
			<header className={styles.cardHeader} data-flx="moderation.report.report-step-details.card-header">
				<p className={styles.eyebrow} data-flx="moderation.report.report-step-details.eyebrow">
					<Trans>Step 4</Trans>
				</p>
				<h1 className={styles.title} data-flx="moderation.report.report-step-details.title">
					<Trans>Report details</Trans>
				</h1>
				<p className={styles.description} data-flx="moderation.report.report-step-details.description">
					<Trans>Share what our team needs to assess this.</Trans>
				</p>
			</header>
			<div className={styles.cardBody} data-flx="moderation.report.report-step-details.card-body">
				{showGeneralError && (
					<div
						className={styles.errorBox}
						role="alert"
						aria-live="polite"
						data-flx="moderation.report.report-step-details.error-box"
					>
						{errorMessage}
					</div>
				)}
				<form
					className={styles.form}
					onSubmit={(e) => {
						e.preventDefault();
						onSubmit();
					}}
					data-flx="moderation.report.report-step-details.form.prevent-default"
				>
					<Combobox<string>
						label={i18n._(VIOLATION_CATEGORY_DESCRIPTOR)}
						value={formValues.category}
						options={categoryOptions}
						error={fieldErrors.category}
						onChange={(value) => onFieldChange('category', value)}
						isSearchable={false}
						data-flx="moderation.report.report-step-details.select.field-change"
					/>
					{selectedType === 'message' && (
						<>
							<Input
								label={i18n._(MESSAGE_LINK_DESCRIPTOR)}
								type="url"
								value={formValues.messageLink}
								onChange={(e) => onFieldChange('messageLink', e.target.value)}
								placeholder={EXAMPLE_MESSAGE_LINK}
								autoComplete="off"
								error={fieldErrors.messageLink}
								footer={
									!formValues.messageLink.trim() ? undefined : !messageLinkOk ? (
										<span className={styles.helperText} data-flx="moderation.report.report-step-details.helper-text">
											<Trans>That doesn't look like a valid URL.</Trans>
										</span>
									) : undefined
								}
								data-flx="moderation.report.report-step-details.input.field-change.url"
							/>
							<Input
								label={i18n._(REPORTED_USER_TAG_OPTIONAL_DESCRIPTOR)}
								type="text"
								value={formValues.messageUserTag}
								onChange={(e) => onFieldChange('messageUserTag', e.target.value)}
								placeholder={EXAMPLE_REPORT_USER_TAG}
								autoComplete="off"
								error={fieldErrors.messageUserTag}
								data-flx="moderation.report.report-step-details.input.field-change.text"
							/>
						</>
					)}
					{selectedType === 'user' && (
						<>
							<Input
								label={i18n._(USER_ID_OPTIONAL_DESCRIPTOR)}
								type="text"
								value={formValues.userId}
								onChange={(e) => onFieldChange('userId', e.target.value)}
								placeholder="123456789012345678"
								autoComplete="off"
								error={fieldErrors.userId}
								data-flx="moderation.report.report-step-details.input.field-change.text--2"
							/>
							<Input
								label={i18n._(USER_TAG_OPTIONAL_DESCRIPTOR)}
								type="text"
								value={formValues.userTag}
								onChange={(e) => onFieldChange('userTag', e.target.value)}
								placeholder={EXAMPLE_REPORT_USER_TAG}
								autoComplete="off"
								error={fieldErrors.userTag}
								footer={
									userTargetOk ? undefined : (
										<span className={styles.helperText} data-flx="moderation.report.report-step-details.helper-text--2">
											<Trans>Provide at least a user ID or a user tag.</Trans>
										</span>
									)
								}
								data-flx="moderation.report.report-step-details.input.field-change.text--3"
							/>
						</>
					)}
					{selectedType === 'guild' && (
						<>
							<Input
								label={i18n._(COMMUNITY_ID_DESCRIPTOR)}
								type="text"
								value={formValues.guildId}
								onChange={(e) => onFieldChange('guildId', e.target.value)}
								placeholder="123456789012345678"
								autoComplete="off"
								error={fieldErrors.guildId}
								footer={
									guildTargetOk ? undefined : (
										<span className={styles.helperText} data-flx="moderation.report.report-step-details.helper-text--3">
											<Trans>Community ID is required.</Trans>
										</span>
									)
								}
								data-flx="moderation.report.report-step-details.input.field-change.text--4"
							/>
							<Input
								label={i18n._(INVITE_CODE_OPTIONAL_DESCRIPTOR)}
								type="text"
								value={formValues.inviteCode}
								onChange={(e) => onFieldChange('inviteCode', e.target.value)}
								placeholder={EXAMPLE_INVITE_CODE}
								autoComplete="off"
								error={fieldErrors.inviteCode}
								data-flx="moderation.report.report-step-details.input.field-change.text--5"
							/>
						</>
					)}
					<Input
						label={i18n._(FULL_LEGAL_NAME_DESCRIPTOR)}
						type="text"
						value={formValues.reporterFullName}
						onChange={(e) => onFieldChange('reporterFullName', e.target.value)}
						placeholder={i18n._(FIRST_AND_LAST_NAME_DESCRIPTOR)}
						autoComplete="name"
						error={fieldErrors.reporterFullName}
						data-flx="moderation.report.report-step-details.input.field-change.text--6"
					/>
					<Combobox<string>
						label={i18n._(COUNTRY_OF_RESIDENCE_DESCRIPTOR)}
						value={formValues.reporterCountry}
						options={countryOptions}
						error={fieldErrors.reporterCountry}
						onChange={(value) => onFieldChange('reporterCountry', value)}
						data-flx="moderation.report.report-step-details.select.field-change--2"
					/>
					<Input
						label={i18n._(YOUR_USERNAME_OPTIONAL_DESCRIPTOR)}
						type="text"
						value={formValues.reporterFluxerTag}
						onChange={(e) => onFieldChange('reporterFluxerTag', e.target.value)}
						placeholder={EXAMPLE_USERNAME_TAG}
						error={fieldErrors.reporterFluxerTag}
						data-flx="moderation.report.report-step-details.input.field-change.text--7"
					/>
					<Textarea
						label={i18n._(ADDITIONAL_COMMENTS_OPTIONAL_DESCRIPTOR)}
						value={formValues.additionalInfo}
						onChange={(e) => onFieldChange('additionalInfo', e.target.value)}
						placeholder={i18n._(DESCRIBE_WHAT_MAKES_THE_CONTENT_ILLEGAL_DESCRIPTOR)}
						maxLength={1000}
						minRows={3}
						maxRows={6}
						error={fieldErrors.additionalInfo}
						data-flx="moderation.report.report-step-details.textarea.field-change"
					/>
					<div className={styles.actionRow} data-flx="moderation.report.report-step-details.action-row">
						<Button
							fitContent
							type="submit"
							disabled={!canSubmit || isSubmitting}
							submitting={isSubmitting}
							className={styles.actionButton}
							data-flx="moderation.report.report-step-details.action-button.submit"
						>
							<Trans>Send DSA report</Trans>
						</Button>
						<Button
							variant="secondary"
							fitContent
							type="button"
							onClick={onBack}
							disabled={isSubmitting}
							data-flx="moderation.report.report-step-details.button.back"
						>
							<Trans>Back</Trans>
						</Button>
					</div>
				</form>
			</div>
			<footer className={styles.footerLinks} data-flx="moderation.report.report-step-details.footer-links">
				<p className={styles.linkRow} data-flx="moderation.report.report-step-details.link-row">
					<button
						type="button"
						className={styles.linkButton}
						onClick={onStartOver}
						disabled={isSubmitting}
						data-flx="moderation.report.report-step-details.link-button.start-over"
					>
						<Trans>Start over</Trans>
					</button>
				</p>
			</footer>
		</div>
	);
};
