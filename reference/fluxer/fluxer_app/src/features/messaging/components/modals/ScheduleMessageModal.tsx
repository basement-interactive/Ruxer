// SPDX-License-Identifier: AGPL-3.0-or-later

import * as Modal from '@app/features/app/components/dialogs/Modal';
import {CANCEL_DESCRIPTOR} from '@app/features/i18n/utils/CommonMessageDescriptors';
import {Button} from '@app/features/ui/button/Button';
import {Combobox, type ComboboxOption} from '@app/features/ui/components/form/FormCombobox';
import {Input} from '@app/features/ui/components/form/FormInput';
import {MS_PER_DAY} from '@fluxer/date_utils/src/DateConstants';
import {getSystemTimeZone} from '@fluxer/date_utils/src/DateIntrospection';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import type React from 'react';
import {useCallback, useEffect, useMemo, useState} from 'react';

const SCHEDULE_MESSAGE_DESCRIPTOR = msg({
	message: 'Schedule message',
	comment: 'Title of the schedule-message modal.',
});
const PICK_A_TIME_WHEN_THIS_MESSAGE_SHOULD_BE_DESCRIPTOR = msg({
	message: 'Pick a time when this message should be posted.',
	comment: 'Helper text in the schedule-message modal explaining the action.',
});
const DATE_TIME_DESCRIPTOR = msg({
	message: 'Date & time',
	comment: 'Field label for the date and time picker in the schedule-message modal. The ampersand is intentional.',
});
const TIMEZONE_DESCRIPTOR = msg({
	message: 'Timezone',
	comment: 'Field label for the timezone picker in the schedule-message modal.',
});
const SCHEDULED_MESSAGES_CAN_BE_AT_MOST_30_DAYS_DESCRIPTOR = msg({
	message: 'Scheduled messages can be at most 30 days in the future.',
	comment:
		'Inline validation message in the schedule-message modal when the picked time is more than 30 days away. Keep tone plain.',
});
const SCHEDULE_DESCRIPTOR = msg({
	message: 'Schedule',
	comment: 'Confirm button label in the schedule-message modal that saves the scheduled send.',
});

interface ScheduleMessageModalProps {
	onClose: () => void;
	onSubmit: (scheduledLocalAt: string, timezone: string) => Promise<void>;
	initialScheduledLocalAt?: string;
	initialTimezone?: string;
	title?: string;
	submitLabel?: string;
	helpText?: React.ReactNode;
}

const formatInputValue = (value: Date): string => value.toISOString().slice(0, 16);
export const ScheduleMessageModal = ({
	onClose,
	onSubmit,
	initialScheduledLocalAt,
	initialTimezone,
	title,
	submitLabel,
	helpText,
}: ScheduleMessageModalProps) => {
	const {i18n} = useLingui();
	const minDateTime = useMemo(() => formatInputValue(new Date(Date.now() + 60_000)), []);
	const maxDateTime = useMemo(() => formatInputValue(new Date(Date.now() + 30 * MS_PER_DAY)), []);
	const defaultTimezone = useMemo(() => getSystemTimeZone(), []);
	const timezoneOptions = useMemo((): Array<ComboboxOption<string>> => {
		const intl = Intl as typeof Intl & {supportedValuesOf?: (type: string) => Array<string>};
		const zones = typeof intl.supportedValuesOf === 'function' ? intl.supportedValuesOf('timeZone') : [defaultTimezone];
		return zones.map((zone) => ({value: zone, label: zone}));
	}, [defaultTimezone]);
	const initialScheduledAt = useMemo(
		() => initialScheduledLocalAt ?? formatInputValue(new Date(Date.now() + 5 * 60 * 1000)),
		[initialScheduledLocalAt],
	);
	const [scheduledLocalAt, setScheduledLocalAt] = useState(initialScheduledAt);
	const [timezone, setTimezone] = useState(initialTimezone ?? defaultTimezone);
	useEffect(() => {
		setScheduledLocalAt(initialScheduledLocalAt ?? formatInputValue(new Date(Date.now() + 5 * 60 * 1000)));
	}, [initialScheduledLocalAt]);
	useEffect(() => {
		if (initialTimezone) {
			setTimezone(initialTimezone);
		}
	}, [initialTimezone]);
	const [submitting, setSubmitting] = useState(false);
	const handleConfirm = useCallback(async () => {
		if (!scheduledLocalAt) {
			return;
		}
		setSubmitting(true);
		try {
			await onSubmit(scheduledLocalAt, timezone);
			onClose();
		} finally {
			setSubmitting(false);
		}
	}, [scheduledLocalAt, timezone, onSubmit, onClose]);
	return (
		<Modal.Root size="small" centered onClose={onClose} data-flx="messaging.schedule-message-modal.modal-root">
			<Modal.Header
				title={title ?? i18n._(SCHEDULE_MESSAGE_DESCRIPTOR)}
				data-flx="messaging.schedule-message-modal.modal-header"
			/>
			<Modal.Content data-flx="messaging.schedule-message-modal.modal-content">
				<Modal.ContentLayout data-flx="messaging.schedule-message-modal.modal-content-layout">
					<Modal.Description data-flx="messaging.schedule-message-modal.modal-description">
						{helpText ?? i18n._(PICK_A_TIME_WHEN_THIS_MESSAGE_SHOULD_BE_DESCRIPTOR)}
					</Modal.Description>
					<Modal.InputGroup data-flx="messaging.schedule-message-modal.modal-input-group">
						<Input
							id="schedule-message-time"
							type="datetime-local"
							label={i18n._(DATE_TIME_DESCRIPTOR)}
							min={minDateTime}
							max={maxDateTime}
							value={scheduledLocalAt}
							onChange={(event) => setScheduledLocalAt(event.target.value)}
							data-flx="messaging.schedule-message-modal.schedule-message-time.set-scheduled-local-at.datetime-local"
						/>
						<Combobox
							id="schedule-message-timezone"
							label={i18n._(TIMEZONE_DESCRIPTOR)}
							description={i18n._(SCHEDULED_MESSAGES_CAN_BE_AT_MOST_30_DAYS_DESCRIPTOR)}
							value={timezone}
							options={timezoneOptions}
							onChange={setTimezone}
							data-flx="messaging.schedule-message-modal.schedule-message-timezone.set-timezone"
						/>
					</Modal.InputGroup>
				</Modal.ContentLayout>
			</Modal.Content>
			<Modal.Footer data-flx="messaging.schedule-message-modal.modal-footer">
				<Button variant="secondary" onClick={onClose} data-flx="messaging.schedule-message-modal.button.close">
					{i18n._(CANCEL_DESCRIPTOR)}
				</Button>
				<Button
					variant="primary"
					onClick={handleConfirm}
					submitting={submitting}
					disabled={!scheduledLocalAt}
					data-flx="messaging.schedule-message-modal.button.confirm"
				>
					{submitLabel ?? i18n._(SCHEDULE_DESCRIPTOR)}
				</Button>
			</Modal.Footer>
		</Modal.Root>
	);
};
