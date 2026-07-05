// SPDX-License-Identifier: AGPL-3.0-or-later

import * as Modal from '@app/features/app/components/dialogs/Modal';
import {Button} from '@app/features/ui/button/Button';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {DateTimePickerField} from '@app/features/ui/components/form/DateTimePickerField';
import {msg} from '@lingui/core/macro';
import {Trans, useLingui} from '@lingui/react/macro';
import {useCallback, useState} from 'react';

const CUSTOM_DATE_RANGE_DESCRIPTOR = msg({
	message: 'Custom date range',
	comment: 'Short label in the guild members date range modal. Keep it concise.',
});
const AFTER_DATE_DESCRIPTOR = msg({
	message: 'After date',
	comment: 'Short label in the guild members date range modal. Keep it concise.',
});
const BEFORE_DATE_DESCRIPTOR = msg({
	message: 'Before date',
	comment: 'Short label in the guild members date range modal. Keep it concise.',
});

interface GuildMembersDateRangeModalProps {
	onApply: (gte: number | undefined, lte: number | undefined) => void;
	initialGte?: number;
	initialLte?: number;
}

export function GuildMembersDateRangeModal({onApply, initialGte, initialLte}: GuildMembersDateRangeModalProps) {
	const {i18n} = useLingui();
	const [afterDate, setAfterDate] = useState<Date | null>(initialGte != null ? new Date(initialGte * 1000) : null);
	const [beforeDate, setBeforeDate] = useState<Date | null>(initialLte != null ? new Date(initialLte * 1000) : null);
	const handleClear = useCallback(() => {
		onApply(undefined, undefined);
		ModalCommands.pop();
	}, [onApply]);
	const handleApply = useCallback(() => {
		const gte = afterDate ? Math.floor(afterDate.getTime() / 1000) : undefined;
		const lte = beforeDate ? Math.floor(beforeDate.getTime() / 1000) : undefined;
		onApply(gte, lte);
		ModalCommands.pop();
	}, [afterDate, beforeDate, onApply]);
	return (
		<Modal.Root size="small" data-flx="guild.guild-tabs.guild-members-date-range-modal.modal-root">
			<Modal.Header
				title={i18n._(CUSTOM_DATE_RANGE_DESCRIPTOR)}
				data-flx="guild.guild-tabs.guild-members-date-range-modal.modal-header"
			/>
			<Modal.Content data-flx="guild.guild-tabs.guild-members-date-range-modal.modal-content">
				<Modal.ContentLayout data-flx="guild.guild-tabs.guild-members-date-range-modal.modal-content-layout">
					<DateTimePickerField
						label={i18n._(AFTER_DATE_DESCRIPTOR)}
						value={afterDate}
						onChange={setAfterDate}
						maxDate={beforeDate ?? undefined}
						data-flx="guild.guild-tabs.guild-members-date-range-modal.date-time-picker-field.set-after-date"
					/>
					<DateTimePickerField
						label={i18n._(BEFORE_DATE_DESCRIPTOR)}
						value={beforeDate}
						onChange={setBeforeDate}
						minDate={afterDate ?? undefined}
						data-flx="guild.guild-tabs.guild-members-date-range-modal.date-time-picker-field.set-before-date"
					/>
				</Modal.ContentLayout>
			</Modal.Content>
			<Modal.FormFooter data-flx="guild.guild-tabs.guild-members-date-range-modal.modal-form-footer">
				<Button
					variant="secondary"
					onClick={handleClear}
					data-flx="guild.guild-tabs.guild-members-date-range-modal.button.clear"
				>
					<Trans>Clear</Trans>
				</Button>
				<Button
					variant="primary"
					onClick={handleApply}
					data-flx="guild.guild-tabs.guild-members-date-range-modal.button.apply"
				>
					<Trans>Apply</Trans>
				</Button>
			</Modal.FormFooter>
		</Modal.Root>
	);
}
