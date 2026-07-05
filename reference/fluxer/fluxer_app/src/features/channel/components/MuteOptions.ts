// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	getFiniteTimeWindowPresets,
	minutesToMs,
	TIME_WINDOW_FOR_LABEL_MESSAGES,
	type TimeWindowKey,
	type TimeWindowPreset,
} from '@app/features/app/config/TimeWindowPresets';
import type {I18n, MessageDescriptor} from '@lingui/core';
import {msg} from '@lingui/core/macro';

const UNTIL_I_TURN_IT_BACK_ON_DESCRIPTOR = msg({
	message: 'Until I turn it back on',
	comment: 'Label in the channel and chat mute options.',
});

export interface MuteDurationOption {
	label: string;
	value: number | null;
}

interface MuteDurationOptionDescriptor {
	label: MessageDescriptor;
	value: number | null;
}

const FINITE_MUTE_DURATION_DESCRIPTORS: ReadonlyArray<MuteDurationOptionDescriptor> = getFiniteTimeWindowPresets({
	includeDeveloperOptions: false,
}).map((preset: TimeWindowPreset) => {
	const key = preset.key as Exclude<TimeWindowKey, 'never'>;
	return {
		label: TIME_WINDOW_FOR_LABEL_MESSAGES[key],
		value: minutesToMs(preset.minutes),
	};
});
const INDEFINITE_MUTE_DURATION_DESCRIPTOR: MuteDurationOptionDescriptor = {
	label: UNTIL_I_TURN_IT_BACK_ON_DESCRIPTOR,
	value: null,
};
const MUTE_DURATION_OPTION_DESCRIPTORS: ReadonlyArray<MuteDurationOptionDescriptor> = [
	...FINITE_MUTE_DURATION_DESCRIPTORS,
	INDEFINITE_MUTE_DURATION_DESCRIPTOR,
];
export const getMuteDurationOptions = (i18n: I18n): Array<MuteDurationOption> => {
	return MUTE_DURATION_OPTION_DESCRIPTORS.map((opt) => ({
		...opt,
		label: i18n._(opt.label),
	}));
};
export const createMuteConfig = (value: number | null) =>
	value == null
		? null
		: {
				selected_time_window: value,
				end_time: new Date(Date.now() + value).toISOString(),
			};
