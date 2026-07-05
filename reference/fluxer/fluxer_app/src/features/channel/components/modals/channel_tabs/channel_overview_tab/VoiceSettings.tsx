// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/channel/components/modals/channel_tabs/ChannelOverviewTab.module.css';
import {
	BITRATE_OPTIONS,
	type FormInputs,
	getNearestBitrate,
} from '@app/features/channel/components/modals/channel_tabs/channel_overview_tab/shared';
import type {ComboboxOption} from '@app/features/ui/components/form/FormCombobox';
import {RESET_SLIDER_TO_DEFAULT_VALUE_DESCRIPTOR, Slider} from '@app/features/ui/components/Slider';
import {CompactComboboxRow} from '@app/features/user/components/modals/tabs/components/CompactComboboxRow';
import {
	VOICE_CHANNEL_CONNECTION_LIMIT_DEFAULT,
	VOICE_CHANNEL_CONNECTION_LIMIT_MAX,
	VOICE_CHANNEL_CONNECTION_LIMIT_MIN,
} from '@fluxer/constants/src/LimitConstants';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import type React from 'react';
import {useEffect, useMemo} from 'react';
import {Controller, type UseFormReturn} from 'react-hook-form';

const PARTICIPANT_LIMIT_LABEL_DESCRIPTOR = msg({
	message: 'Participant limit',
	comment: 'Voice channel setting label for the maximum number of members in the voice channel.',
});
const CONNECTION_LIMIT_LABEL_DESCRIPTOR = msg({
	message: 'Connection limit',
	comment: 'Voice channel setting label for the maximum number of active connections per member.',
});
const CONNECTION_LIMIT_DESCRIPTION_DESCRIPTOR = msg({
	message: 'Per member, across all devices.',
	comment: 'Helper text for the voice channel connection limit field.',
});
const VOICE_QUALITY_DESCRIPTOR = msg({
	message: 'Voice quality',
	comment: 'Voice channel setting label for the voice bitrate preset.',
});
const KBPS_DESCRIPTOR = msg({
	message: '{kilobits} kbps',
	comment: 'Voice channel bitrate option label. kbps means kilobits per second.',
});
const PARTICIPANT_LIMIT_VALUE_DESCRIPTOR = msg({
	message: '{count, plural, =0 {∞ No limit} one {# participant} other {# participants}}',
	comment: 'Displayed value for the voice channel participant limit slider. ∞ is the infinity symbol.',
});
const CONNECTION_LIMIT_VALUE_DESCRIPTOR = msg({
	message: '{count, plural, one {# connection} other {# connections}}',
	comment: 'Displayed value for the voice channel connection limit slider.',
});

const resolveVoiceBitrateInput = (
	inputValue: string,
	options: ReadonlyArray<ComboboxOption<number>>,
): number | undefined => {
	const normalized = inputValue.trim().toLowerCase();
	if (!normalized) return undefined;
	const numericMatch = normalized.match(/([0-9]+(?:\.[0-9]+)?)/);
	if (!numericMatch) return undefined;
	const parsedValue = Number(numericMatch[1]);
	if (!Number.isFinite(parsedValue)) return undefined;
	const valueInKbps = normalized.includes('mbps') ? parsedValue * 1000 : parsedValue;
	let nearest = options[0]?.value;
	let nearestDistance = Number.POSITIVE_INFINITY;
	for (const option of options) {
		const distance = Math.abs(option.value - valueInKbps);
		if (distance < nearestDistance) {
			nearest = option.value;
			nearestDistance = distance;
		}
	}
	return nearest;
};

interface VoiceSettingsProps {
	form: UseFormReturn<FormInputs>;
}

interface SettingsControlRowProps {
	label: string;
	description?: string;
	dataFlx: string;
	children: React.ReactNode;
}

const formatIntegerValue = (value: number): string => String(Math.round(value));

const formatParticipantLimitMarker = (value: number): string => {
	if (value === 0) return '∞';
	return formatIntegerValue(value);
};

const formatConnectionLimitMarker = (value: number): string | null => {
	if (value === VOICE_CHANNEL_CONNECTION_LIMIT_MIN) return null;
	return formatIntegerValue(value);
};

const SettingsControlRow: React.FC<SettingsControlRowProps> = ({label, description, dataFlx, children}) => {
	return (
		<div className={styles.settingsControlRow} data-flx={`${dataFlx}.row`}>
			<div className={styles.settingsControlText} data-flx={`${dataFlx}.text`}>
				<div className={styles.settingsControlTitleRow} data-flx={`${dataFlx}.title-row`}>
					<span className={styles.settingsControlLabel} data-flx={`${dataFlx}.label`}>
						{label}
					</span>
				</div>
				{description != null && (
					<p className={styles.settingsControlDescription} data-flx={`${dataFlx}.description`}>
						{description}
					</p>
				)}
			</div>
			{children}
		</div>
	);
};

const VoiceBitrateSelectField: React.FC<{
	value: number | undefined;
	onChange: (value: number) => void;
}> = ({value, onChange}) => {
	const {i18n} = useLingui();
	const options: ReadonlyArray<ComboboxOption<number>> = useMemo(
		() => BITRATE_OPTIONS.map((kilobits) => ({value: kilobits, label: i18n._(KBPS_DESCRIPTOR, {kilobits})})),
		[i18n.locale],
	);
	const currentValue = typeof value === 'number' ? value : BITRATE_OPTIONS[1];
	const selectedValue = getNearestBitrate(currentValue);
	useEffect(() => {
		if (currentValue !== selectedValue) onChange(selectedValue);
	}, [currentValue, onChange, selectedValue]);
	return (
		<CompactComboboxRow<number>
			label={i18n._(VOICE_QUALITY_DESCRIPTOR)}
			value={selectedValue}
			options={options}
			onChange={onChange}
			autoSelectValueFromInput={resolveVoiceBitrateInput}
			controlWidth="small"
			dataFlx="channel.channel-tabs.channel-overview-tab.form-select.voice-quality"
			data-flx="channel.channel-tabs.channel-overview-tab.voice-settings.voice-bitrate-select-field.compact-select-row.change"
		/>
	);
};

export const VoiceSettings: React.FC<VoiceSettingsProps> = ({form}) => {
	const {i18n} = useLingui();
	const resetSliderLabel = i18n._(RESET_SLIDER_TO_DEFAULT_VALUE_DESCRIPTOR);
	const participantLimitLabel = i18n._(PARTICIPANT_LIMIT_LABEL_DESCRIPTOR);
	return (
		<>
			<div data-flx="channel.channel-tabs.channel-overview-tab.div--3">
				<Controller
					name="bitrate"
					control={form.control}
					render={({field}) => (
						<VoiceBitrateSelectField
							value={field.value}
							onChange={field.onChange}
							data-flx="channel.channel-tabs.channel-overview-tab.voice-settings.voice-bitrate-select-field.change"
						/>
					)}
					data-flx="channel.channel-tabs.channel-overview-tab.controller--2"
				/>
			</div>
			<div data-flx="channel.channel-tabs.channel-overview-tab.div--4">
				<Controller
					name="user_limit"
					control={form.control}
					render={({field}) => {
						const currentValue = typeof field.value === 'number' ? field.value : 0;
						return (
							<SettingsControlRow
								label={participantLimitLabel}
								dataFlx="channel.channel-tabs.channel-overview-tab.participant-limit"
								data-flx="channel.channel-tabs.channel-overview-tab.voice-settings.settings-control-row.participant-limit"
							>
								<div
									className={styles.settingsSliderControl}
									data-flx="channel.channel-tabs.channel-overview-tab.participant-limit.slider-wrap"
								>
									<Slider
										value={currentValue}
										defaultValue={currentValue}
										factoryDefaultValue={0}
										minValue={0}
										maxValue={99}
										step={1}
										markers={[0, 25, 50, 75, 99]}
										ariaLabel={participantLimitLabel}
										onMarkerRender={formatParticipantLimitMarker}
										onValueRender={(value) => i18n._(PARTICIPANT_LIMIT_VALUE_DESCRIPTOR, {count: Math.round(value)})}
										onValueChange={field.onChange}
										showResetButton={true}
										onReset={() => field.onChange(0)}
										resetTooltip={resetSliderLabel}
										data-flx="channel.channel-tabs.channel-overview-tab.participant-limit.slider"
									/>
								</div>
							</SettingsControlRow>
						);
					}}
					data-flx="channel.channel-tabs.channel-overview-tab.controller--3"
				/>
			</div>
		</>
	);
};

export const VoiceConnectionLimitControl: React.FC<VoiceSettingsProps> = ({form}) => {
	const {i18n} = useLingui();
	const resetSliderLabel = i18n._(RESET_SLIDER_TO_DEFAULT_VALUE_DESCRIPTOR);
	const connectionLimitLabel = i18n._(CONNECTION_LIMIT_LABEL_DESCRIPTOR);
	const connectionLimitDescription = i18n._(CONNECTION_LIMIT_DESCRIPTION_DESCRIPTOR);
	return (
		<div data-flx="channel.channel-tabs.channel-overview-tab.div--5">
			<Controller
				name="voice_connection_limit"
				control={form.control}
				render={({field}) => {
					const currentValue = typeof field.value === 'number' ? field.value : VOICE_CHANNEL_CONNECTION_LIMIT_DEFAULT;
					return (
						<SettingsControlRow
							label={connectionLimitLabel}
							description={connectionLimitDescription}
							dataFlx="channel.channel-tabs.channel-overview-tab.voice-connection-limit"
							data-flx="channel.channel-tabs.channel-overview-tab.voice-settings.voice-connection-limit-control.settings-control-row"
						>
							<div
								className={styles.settingsSliderControl}
								data-flx="channel.channel-tabs.channel-overview-tab.voice-connection-limit.slider-wrap"
							>
								<Slider
									value={currentValue}
									defaultValue={currentValue}
									factoryDefaultValue={VOICE_CHANNEL_CONNECTION_LIMIT_DEFAULT}
									minValue={VOICE_CHANNEL_CONNECTION_LIMIT_MIN}
									maxValue={VOICE_CHANNEL_CONNECTION_LIMIT_MAX}
									step={1}
									markers={[1, 5, 25, 50, 75, 100]}
									ariaLabel={connectionLimitLabel}
									onMarkerRender={formatConnectionLimitMarker}
									onValueRender={(value) => i18n._(CONNECTION_LIMIT_VALUE_DESCRIPTOR, {count: Math.round(value)})}
									onValueChange={field.onChange}
									showResetButton={true}
									onReset={() => field.onChange(VOICE_CHANNEL_CONNECTION_LIMIT_DEFAULT)}
									resetTooltip={resetSliderLabel}
									data-flx="channel.channel-tabs.channel-overview-tab.voice-connection-limit.slider"
								/>
							</div>
						</SettingsControlRow>
					);
				}}
				data-flx="channel.channel-tabs.channel-overview-tab.controller--4"
			/>
		</div>
	);
};
