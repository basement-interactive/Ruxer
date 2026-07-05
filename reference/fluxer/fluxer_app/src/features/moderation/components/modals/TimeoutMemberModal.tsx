// SPDX-License-Identifier: AGPL-3.0-or-later

import * as Modal from '@app/features/app/components/dialogs/Modal';
import * as GuildMemberCommands from '@app/features/member/commands/GuildMemberCommands';
import {showModerationErrorModal} from '@app/features/moderation/components/alerts/ModerationErrorModalUtils';
import styles from '@app/features/moderation/components/modals/TimeoutMemberModal.module.css';
import {getTimeoutDurationOptions} from '@app/features/moderation/components/modals/TimeoutMemberOptions';
import {Logger} from '@app/features/platform/utils/AppLogger';
import {Button} from '@app/features/ui/button/Button';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import * as ToastCommands from '@app/features/ui/commands/ToastCommands';
import {Combobox as FormCombobox} from '@app/features/ui/components/form/FormCombobox';
import {Input, Textarea} from '@app/features/ui/components/form/FormInput';
import {formatGuildSettingsPath} from '@app/features/user/components/settings_utils/GuildSettingsConstants';
import type {User} from '@app/features/user/models/User';
import {
	DAYS_PER_YEAR,
	SECONDS_PER_DAY,
	SECONDS_PER_HOUR,
	SECONDS_PER_MINUTE,
} from '@fluxer/date_utils/src/DateConstants';
import {msg} from '@lingui/core/macro';
import {Trans, useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback, useMemo, useState} from 'react';

const SECONDS_DESCRIPTOR = msg({
	message: 'Seconds',
	comment:
		'Custom-duration unit option in the timeout-member modal. Plural unit label paired with the numeric duration input.',
});
const MINUTES_DESCRIPTOR = msg({
	message: 'Minutes',
	comment:
		'Custom-duration unit option in the timeout-member modal. Plural unit label paired with the numeric duration input.',
});
const HOURS_DESCRIPTOR = msg({
	message: 'Hours',
	comment:
		'Custom-duration unit option in the timeout-member modal. Plural unit label paired with the numeric duration input.',
});
const DAYS_DESCRIPTOR = msg({
	message: 'Days',
	comment:
		'Custom-duration unit option in the timeout-member modal. Plural unit label paired with the numeric duration input.',
});
const CUSTOM_DURATION_DESCRIPTOR = msg({
	message: 'Custom duration',
	comment:
		'Last option in the timeout duration dropdown of the timeout-member modal. Reveals a numeric input plus a unit dropdown.',
});
const DURATION_MUST_BE_GREATER_THAN_ZERO_DESCRIPTOR = msg({
	message: 'Duration must be greater than zero.',
	comment:
		'Inline validation error on the custom duration input of the timeout-member modal when the value is zero or negative.',
});
const TIMEOUT_CANNOT_EXCEED_365_DAYS_DESCRIPTOR = msg({
	message: 'Timeout cannot exceed 365 days.',
	comment:
		'Inline validation error on the custom duration input of the timeout-member modal when the resolved duration exceeds the 365-day cap.',
});
const TIMEOUT_DESCRIPTOR = msg({
	message: 'Timeout {tag}',
	comment:
		'Title of the timeout-member modal. {tag} is the target user tag (username#tag). Moderation action; keep tone direct.',
});
const TIMEOUT_DURATION_DESCRIPTOR = msg({
	message: 'Timeout duration',
	comment: 'Label above the timeout duration dropdown in the timeout-member modal.',
});
const HOW_LONG_THIS_USER_SHOULD_BE_TIMED_OUT_DESCRIPTOR = msg({
	message: 'How long they stay timed out.',
	comment: 'Helper text under the timeout duration dropdown in the timeout-member modal.',
});
const UNIT_DESCRIPTOR = msg({
	message: 'Unit',
	comment:
		'Label of the unit selector next to the custom duration input in the timeout-member modal. Short standalone label.',
});
const REASON_OPTIONAL_DESCRIPTOR = msg({
	message: 'Reason (optional)',
	comment:
		'Label of the optional reason textarea in the timeout-member modal. The reason is recorded in the activity log.',
});
const logger = new Logger('TimeoutMemberModal');

interface ComboboxOption<V extends string | number = number> {
	value: V;
	label: string;
}

interface TimeoutMemberModalProps {
	guildId: string;
	targetUser: User;
}

const MAX_TIMEOUT_SECONDS = DAYS_PER_YEAR * SECONDS_PER_DAY;

type CustomDurationUnit = 'seconds' | 'minutes' | 'hours' | 'days';

const CUSTOM_DURATION_MULTIPLIERS: Record<CustomDurationUnit, number> = {
	seconds: 1,
	minutes: SECONDS_PER_MINUTE,
	hours: SECONDS_PER_HOUR,
	days: SECONDS_PER_DAY,
};
export const TimeoutMemberModal: React.FC<TimeoutMemberModalProps> = observer(({guildId, targetUser}) => {
	const {i18n} = useLingui();
	const activityLogSettingsPath = formatGuildSettingsPath(i18n, 'audit_log');
	const getCustomDurationUnitOptions = useCallback(
		(): ReadonlyArray<ComboboxOption<CustomDurationUnit>> => [
			{value: 'seconds', label: i18n._(SECONDS_DESCRIPTOR)},
			{value: 'minutes', label: i18n._(MINUTES_DESCRIPTOR)},
			{value: 'hours', label: i18n._(HOURS_DESCRIPTOR)},
			{value: 'days', label: i18n._(DAYS_DESCRIPTOR)},
		],
		[i18n],
	);
	const timeoutDurationOptions = useMemo(() => getTimeoutDurationOptions(i18n), [i18n.locale]);
	const durationOptions = useMemo<Array<ComboboxOption<number | 'custom'>>>(() => {
		const baseOptions = timeoutDurationOptions.map((option) => ({
			value: option.value,
			label: option.label,
		}));
		return [...baseOptions, {value: 'custom' as const, label: i18n._(CUSTOM_DURATION_DESCRIPTOR)}];
	}, [timeoutDurationOptions, i18n.locale]);
	const customDurationUnitOptions = getCustomDurationUnitOptions();
	const [selectedDuration, setSelectedDuration] = useState<number | 'custom'>(timeoutDurationOptions[3].value);
	const [customDurationValue, setCustomDurationValue] = useState('10');
	const [customDurationUnit, setCustomDurationUnit] = useState<CustomDurationUnit>('minutes');
	const [reason, setReason] = useState('');
	const [isSubmitting, setIsSubmitting] = useState(false);
	const customDurationNumber = Number(customDurationValue);
	const customDurationSeconds =
		Number.isFinite(customDurationNumber) && customDurationNumber > 0
			? customDurationNumber * CUSTOM_DURATION_MULTIPLIERS[customDurationUnit]
			: 0;
	const customDurationError =
		selectedDuration === 'custom'
			? customDurationNumber <= 0
				? i18n._(DURATION_MUST_BE_GREATER_THAN_ZERO_DESCRIPTOR)
				: customDurationSeconds > MAX_TIMEOUT_SECONDS
					? i18n._(TIMEOUT_CANNOT_EXCEED_365_DAYS_DESCRIPTOR)
					: undefined
			: undefined;
	const isCustomDurationValid = selectedDuration !== 'custom' || !customDurationError;
	const effectiveDurationSeconds = selectedDuration === 'custom' ? customDurationSeconds : (selectedDuration as number);
	const handleTimeout = async () => {
		if (selectedDuration === 'custom' && (!isCustomDurationValid || customDurationSeconds <= 0)) {
			return;
		}
		setIsSubmitting(true);
		try {
			const timeoutUntil = new Date(Date.now() + effectiveDurationSeconds * 1000).toISOString();
			const trimmedReason = reason.trim();
			await GuildMemberCommands.timeout(guildId, targetUser.id, timeoutUntil, trimmedReason || null);
			ToastCommands.createToast({
				type: 'success',
				children: <Trans>Timed out {targetUser.tag}</Trans>,
			});
			ModalCommands.pop();
		} catch (error) {
			logger.error('Failed to time out member:', error);
			showModerationErrorModal(
				i18n,
				<Trans>Failed to time out member. Try again.</Trans>,
				'moderation.timeout-member-modal.timeout-error-modal',
			);
		} finally {
			setIsSubmitting(false);
		}
	};
	return (
		<Modal.Root size="small" centered data-flx="moderation.timeout-member-modal.modal-root">
			<Modal.Header
				title={i18n._(TIMEOUT_DESCRIPTOR, {tag: targetUser.tag})}
				data-flx="moderation.timeout-member-modal.modal-header"
			/>
			<Modal.Content data-flx="moderation.timeout-member-modal.modal-content">
				<Modal.ContentLayout data-flx="moderation.timeout-member-modal.modal-content-layout">
					<Modal.Description data-flx="moderation.timeout-member-modal.helper-text">
						<Trans>
							Prevent <strong data-flx="moderation.timeout-member-modal.strong">{targetUser.tag}</strong> from sending
							messages, reacting, and joining voice channels for the specified duration.
						</Trans>
					</Modal.Description>
					<FormCombobox<number | 'custom'>
						label={i18n._(TIMEOUT_DURATION_DESCRIPTOR)}
						description={i18n._(HOW_LONG_THIS_USER_SHOULD_BE_TIMED_OUT_DESCRIPTOR)}
						value={selectedDuration}
						onChange={(value) => setSelectedDuration(value)}
						options={durationOptions}
						disabled={isSubmitting}
						data-flx="moderation.timeout-member-modal.form-select.set-selected-duration"
					/>
					{selectedDuration === 'custom' && (
						<>
							<div className={styles.durationInputs} data-flx="moderation.timeout-member-modal.duration-inputs">
								<Input
									type="number"
									label={i18n._(CUSTOM_DURATION_DESCRIPTOR)}
									min={1}
									step={1}
									value={customDurationValue}
									onChange={(event) => setCustomDurationValue(event.target.value)}
									error={customDurationError}
									disabled={isSubmitting}
									data-flx="moderation.timeout-member-modal.input.set-custom-duration-value.number"
								/>
								<FormCombobox<CustomDurationUnit>
									label={i18n._(UNIT_DESCRIPTOR)}
									value={customDurationUnit}
									onChange={(value) => setCustomDurationUnit(value)}
									options={customDurationUnitOptions}
									disabled={isSubmitting}
									data-flx="moderation.timeout-member-modal.form-select.set-custom-duration-unit"
								/>
							</div>
							<Modal.Description className={styles.hint} data-flx="moderation.timeout-member-modal.hint">
								<Trans>Enter a numeric value and choose a unit.</Trans>
							</Modal.Description>
							<Modal.Description className={styles.hint} data-flx="moderation.timeout-member-modal.hint--2">
								<Trans>
									The timeout cannot exceed {DAYS_PER_YEAR} days ({MAX_TIMEOUT_SECONDS} seconds).
								</Trans>
							</Modal.Description>
						</>
					)}
					<Textarea
						label={i18n._(REASON_OPTIONAL_DESCRIPTOR)}
						value={reason}
						onChange={(event) => setReason(event.target.value)}
						maxLength={512}
						minRows={3}
						disabled={isSubmitting}
						data-flx="moderation.timeout-member-modal.textarea.set-reason"
					/>
					<Modal.Description className={styles.hint} data-flx="moderation.timeout-member-modal.hint--3">
						<Trans>This reason will be displayed in the activity log in {activityLogSettingsPath}.</Trans>
					</Modal.Description>
				</Modal.ContentLayout>
			</Modal.Content>
			<Modal.Footer data-flx="moderation.timeout-member-modal.modal-footer">
				<Button
					variant="secondary"
					onClick={() => ModalCommands.pop()}
					disabled={isSubmitting}
					data-flx="moderation.timeout-member-modal.button.pop"
				>
					<Trans>Cancel</Trans>
				</Button>
				<Button
					variant="danger"
					onClick={handleTimeout}
					disabled={isSubmitting || (selectedDuration === 'custom' && !isCustomDurationValid)}
					data-flx="moderation.timeout-member-modal.button.timeout"
				>
					<Trans>Timeout</Trans>
				</Button>
			</Modal.Footer>
		</Modal.Root>
	);
});
