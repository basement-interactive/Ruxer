// SPDX-License-Identifier: AGPL-3.0-or-later

import type {FormInputs} from '@app/features/channel/components/modals/channel_tabs/channel_overview_tab/shared';
import {formatPermissionLabel} from '@app/features/permissions/utils/PermissionUtils';
import type {ComboboxOption} from '@app/features/ui/components/form/FormCombobox';
import {CompactComboboxRow} from '@app/features/user/components/modals/tabs/components/CompactComboboxRow';
import {Permissions} from '@fluxer/constants/src/ChannelConstants';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import type React from 'react';
import {useEffect, useMemo} from 'react';
import {Controller, type UseFormReturn} from 'react-hook-form';

const SECONDS_DESCRIPTOR = msg({
	message: '{seconds} seconds',
	comment:
		'Channel overview settings tab label, control, or validation message (name, topic, slowmode, voice region, mature content gate).',
});
const MINUTES_DESCRIPTOR = msg({
	message: '{minutes} minutes',
	comment:
		'Channel overview settings tab label, control, or validation message (name, topic, slowmode, voice region, mature content gate).',
});
const HOURS_DESCRIPTOR = msg({
	message: '{hours} hours',
	comment:
		'Channel overview settings tab label, control, or validation message (name, topic, slowmode, voice region, mature content gate).',
});
const OFF_DESCRIPTOR = msg({
	message: 'Off',
	comment:
		'Channel overview settings tab label, control, or validation message (name, topic, slowmode, voice region, mature content gate).',
});
const MINUTE_DESCRIPTOR = msg({
	message: '{oneMinute} minute',
	comment:
		'Channel overview settings tab label, control, or validation message (name, topic, slowmode, voice region, mature content gate).',
});
const HOUR_DESCRIPTOR = msg({
	message: '{oneHour} hour',
	comment:
		'Channel overview settings tab label, control, or validation message (name, topic, slowmode, voice region, mature content gate).',
});
const SLOWMODE_DESCRIPTOR = msg({
	message: 'Slowmode',
	comment:
		'Channel overview settings tab label, control, or validation message (name, topic, slowmode, voice region, mature content gate).',
});
const SLOWMODE_DESCRIPTION_DESCRIPTOR = msg({
	message: 'Wait between messages. "{bypassSlowmodePermissionLabel}" can bypass it.',
	comment:
		'Description under the slowmode select in channel settings. bypassSlowmodePermissionLabel is the localized Bypass Slowmode permission name.',
});

const getNearestSlowmodeValue = (value: number, options: ReadonlyArray<ComboboxOption<number>>): number => {
	let nearest = options[0]?.value ?? 0;
	let nearestDistance = Number.POSITIVE_INFINITY;
	for (const option of options) {
		const distance = Math.abs(option.value - value);
		if (distance < nearestDistance) {
			nearest = option.value;
			nearestDistance = distance;
		}
	}
	return nearest;
};

const parseSlowmodeInputSeconds = (inputValue: string): number | undefined => {
	const normalized = inputValue.trim().toLowerCase();
	if (!normalized) return undefined;
	if (normalized === 'off' || normalized === 'none' || normalized === 'disabled') return 0;
	const numericMatch = normalized.match(/([0-9]+(?:\.[0-9]+)?)/);
	if (!numericMatch) return undefined;
	const parsedValue = Number(numericMatch[1]);
	if (!Number.isFinite(parsedValue)) return undefined;
	const unitMatch = normalized.match(/[0-9.]\s*([a-z]+)/);
	const unit = unitMatch?.[1] ?? '';
	if (unit.startsWith('h')) return parsedValue * 3600;
	if (unit.startsWith('m')) return parsedValue * 60;
	return parsedValue;
};

const resolveSlowmodeInput = (
	inputValue: string,
	options: ReadonlyArray<ComboboxOption<number>>,
): number | undefined => {
	const seconds = parseSlowmodeInputSeconds(inputValue);
	if (seconds === undefined) return undefined;
	return getNearestSlowmodeValue(seconds, options);
};

export function useSlowmodeOptions(): Array<ComboboxOption<number>> {
	const {i18n} = useLingui();
	return useMemo(() => {
		const secondsLabel = (seconds: number) => i18n._(SECONDS_DESCRIPTOR, {seconds});
		const minutesLabel = (minutes: number) => i18n._(MINUTES_DESCRIPTOR, {minutes});
		const hoursLabel = (hours: number) => i18n._(HOURS_DESCRIPTOR, {hours});
		const oneMinute = 1;
		const oneHour = 1;
		return [
			{value: 0, label: i18n._(OFF_DESCRIPTOR)},
			{value: 5, label: secondsLabel(5)},
			{value: 10, label: secondsLabel(10)},
			{value: 15, label: secondsLabel(15)},
			{value: 30, label: secondsLabel(30)},
			{value: 60, label: i18n._(MINUTE_DESCRIPTOR, {oneMinute})},
			{value: 120, label: minutesLabel(2)},
			{value: 300, label: minutesLabel(5)},
			{value: 600, label: minutesLabel(10)},
			{value: 900, label: minutesLabel(15)},
			{value: 1800, label: minutesLabel(30)},
			{value: 3600, label: i18n._(HOUR_DESCRIPTOR, {oneHour})},
			{value: 7200, label: hoursLabel(2)},
			{value: 21600, label: hoursLabel(6)},
		];
	}, [i18n.locale]);
}

interface SlowmodeControlProps {
	form: UseFormReturn<FormInputs>;
	slowmodeOptions: Array<ComboboxOption<number>>;
}

const SlowmodeSelectField: React.FC<{
	value: number | undefined;
	onChange: (value: number) => void;
	options: ReadonlyArray<ComboboxOption<number>>;
	description: string;
}> = ({value, onChange, options, description}) => {
	const {i18n} = useLingui();
	const currentValue = value ?? 0;
	const selectedValue = getNearestSlowmodeValue(currentValue, options);
	useEffect(() => {
		if (currentValue !== selectedValue) onChange(selectedValue);
	}, [currentValue, onChange, selectedValue]);
	return (
		<CompactComboboxRow<number>
			label={i18n._(SLOWMODE_DESCRIPTOR)}
			description={description}
			value={selectedValue}
			options={options}
			onChange={onChange}
			autoSelectValueFromInput={resolveSlowmodeInput}
			controlWidth="medium"
			dataFlx="channel.channel-tabs.channel-overview-tab.form-select.change-slowmode"
			data-flx="channel.channel-tabs.channel-overview-tab.slowmode-control.slowmode-select-field.compact-combobox-row.change"
		/>
	);
};

export const SlowmodeControl: React.FC<SlowmodeControlProps> = ({form, slowmodeOptions}) => {
	const {i18n} = useLingui();
	const bypassSlowmodePermissionLabel = formatPermissionLabel(i18n, Permissions.BYPASS_SLOWMODE);
	return (
		<Controller
			name="slowmode"
			control={form.control}
			render={({field}) => {
				return (
					<SlowmodeSelectField
						value={field.value}
						onChange={field.onChange}
						options={slowmodeOptions}
						description={i18n._(SLOWMODE_DESCRIPTION_DESCRIPTOR, {bypassSlowmodePermissionLabel})}
						data-flx="channel.channel-tabs.channel-overview-tab.slowmode-control.slowmode-select-field.change"
					/>
				);
			}}
			data-flx="channel.channel-tabs.channel-overview-tab.controller"
		/>
	);
};
