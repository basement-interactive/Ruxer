// SPDX-License-Identifier: AGPL-3.0-or-later

import type {ChannelRtcRegion} from '@app/features/channel/commands/ChannelCommands';
import type {TriggerType} from '@app/features/messaging/hooks/useTextareaAutocomplete';
import type {ComboboxOption} from '@app/features/ui/components/form/FormCombobox';

export interface FormInputs {
	name: string;
	topic?: string;
	url?: string;
	slowmode?: number;
	nsfw_override: boolean | null;
	content_warning_level: number;
	content_warning_text: string;
	bitrate?: number;
	user_limit?: number;
	voice_connection_limit?: number;
	rtc_region: string | null;
}

export const CHANNEL_OVERVIEW_TAB_ID = 'overview';
export const SETTINGS_AUTOCOMPLETE_Z_INDEX = 10001;
export const BITRATE_OPTIONS = [8, 64, 96, 128] as const;
export const MAX_TOPIC_LENGTH = 1024;
export const TOPIC_AUTOCOMPLETE_TRIGGERS: Array<TriggerType> = ['emoji', 'mention', 'channel'];
export const getNearestBitrate = (value: number): number => {
	return BITRATE_OPTIONS.reduce((closest, option) => {
		return Math.abs(option - value) < Math.abs(closest - value) ? option : closest;
	});
};

export interface RtcRegionOption extends ComboboxOption<string | null> {
	region: ChannelRtcRegion | null;
}
