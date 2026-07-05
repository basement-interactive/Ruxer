// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	FIVE_MINUTES_DURATION_DESCRIPTOR,
	ONE_DAY_DURATION_DESCRIPTOR,
	ONE_HOUR_DURATION_DESCRIPTOR,
	ONE_WEEK_DURATION_DESCRIPTOR,
} from '@app/features/i18n/utils/CommonMessageDescriptors';
import type {I18n, MessageDescriptor} from '@lingui/core';
import {msg} from '@lingui/core/macro';

const MESSAGE_60_SECONDS_DESCRIPTOR = msg({
	comment: 'Timeout duration option for moderating a member.',
	message: '60 seconds',
});
const MESSAGE_10_MINUTES_DESCRIPTOR = msg({
	comment: 'Timeout duration option for moderating a member.',
	message: '10 minutes',
});

export interface TimeoutDurationOption {
	value: number;
	label: string;
}

interface TimeoutDurationOptionDescriptor {
	value: number;
	label: MessageDescriptor;
}

const ONE_MINUTE_SECONDS = 60;
const FIVE_MINUTES_SECONDS = 5 * ONE_MINUTE_SECONDS;
const TEN_MINUTES_SECONDS = 10 * ONE_MINUTE_SECONDS;
const ONE_HOUR_SECONDS = 60 * ONE_MINUTE_SECONDS;
const ONE_DAY_SECONDS = 24 * ONE_HOUR_SECONDS;
const ONE_WEEK_SECONDS = 7 * ONE_DAY_SECONDS;
const TIMEOUT_DURATION_OPTIONS_DESCRIPTORS: ReadonlyArray<TimeoutDurationOptionDescriptor> = [
	{
		value: ONE_MINUTE_SECONDS,
		label: MESSAGE_60_SECONDS_DESCRIPTOR,
	},
	{
		value: FIVE_MINUTES_SECONDS,
		label: FIVE_MINUTES_DURATION_DESCRIPTOR,
	},
	{
		value: TEN_MINUTES_SECONDS,
		label: MESSAGE_10_MINUTES_DESCRIPTOR,
	},
	{
		value: ONE_HOUR_SECONDS,
		label: ONE_HOUR_DURATION_DESCRIPTOR,
	},
	{value: ONE_DAY_SECONDS, label: ONE_DAY_DURATION_DESCRIPTOR},
	{
		value: ONE_WEEK_SECONDS,
		label: ONE_WEEK_DURATION_DESCRIPTOR,
	},
];
export const getTimeoutDurationOptions = (i18n: I18n): ReadonlyArray<TimeoutDurationOption> => {
	return TIMEOUT_DURATION_OPTIONS_DESCRIPTORS.map((opt) => ({
		...opt,
		label: i18n._(opt.label),
	}));
};
