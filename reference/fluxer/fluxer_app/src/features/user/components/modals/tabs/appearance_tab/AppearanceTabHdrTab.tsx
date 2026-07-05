// SPDX-License-Identifier: AGPL-3.0-or-later

import * as AccessibilityCommands from '@app/features/accessibility/commands/AccessibilityCommands';
import Accessibility, {HdrDisplayMode} from '@app/features/accessibility/state/Accessibility';
import type {RadioOption} from '@app/features/ui/radio_group/RadioGroup';
import {RadioGroup} from '@app/features/ui/radio_group/RadioGroup';
import MobileLayout from '@app/features/ui/state/MobileLayout';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';

const FULL_DYNAMIC_RANGE_DESCRIPTOR = msg({
	message: 'Full dynamic range',
	comment: 'Short label in the hdr tab. Keep it concise.',
});
const DISPLAY_HDR_IMAGES_AT_FULL_BRIGHTNESS_AND_COLOR_DESCRIPTOR = msg({
	message: 'Display HDR images at full brightness and color range.',
	comment: 'Description text in the hdr tab.',
});
const STANDARD_RANGE_DESCRIPTOR = msg({
	message: 'Standard range',
	comment: 'Short label in the hdr tab. Keep it concise.',
});
const TONE_MAP_HDR_IMAGES_TO_STANDARD_RANGE_REDUCING_DESCRIPTOR = msg({
	message: 'Tone-map HDR images to standard range, reducing peak brightness.',
	comment: 'Description text in the hdr tab.',
});
const HIGH_DYNAMIC_RANGE_DISPLAY_MODE_DESCRIPTOR = msg({
	message: 'High dynamic range display mode',
	comment: 'Label in the hdr tab.',
});

export function shouldShowHdrSettings(): boolean {
	return !MobileLayout.isMobileLayout();
}

export const HdrTabContent: React.FC = observer(() => {
	const {i18n} = useLingui();
	const hdrDisplayMode = Accessibility.hdrDisplayMode;
	const hdrOptions: ReadonlyArray<RadioOption<HdrDisplayMode>> = [
		{
			value: HdrDisplayMode.FULL,
			name: i18n._(FULL_DYNAMIC_RANGE_DESCRIPTOR),
			desc: i18n._(DISPLAY_HDR_IMAGES_AT_FULL_BRIGHTNESS_AND_COLOR_DESCRIPTOR),
		},
		{
			value: HdrDisplayMode.STANDARD,
			name: i18n._(STANDARD_RANGE_DESCRIPTOR),
			desc: i18n._(TONE_MAP_HDR_IMAGES_TO_STANDARD_RANGE_REDUCING_DESCRIPTOR),
		},
	];
	return (
		<RadioGroup
			options={hdrOptions}
			value={hdrDisplayMode}
			onChange={(value) => {
				AccessibilityCommands.update({hdrDisplayMode: value});
			}}
			aria-label={i18n._(HIGH_DYNAMIC_RANGE_DISPLAY_MODE_DESCRIPTOR)}
			data-flx="user.appearance-tab.hdr-tab.hdr-tab-content.radio-group.update"
		/>
	);
});
