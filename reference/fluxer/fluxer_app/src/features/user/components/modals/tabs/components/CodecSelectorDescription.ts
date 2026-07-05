// SPDX-License-Identifier: AGPL-3.0-or-later

import type {AutomaticScreenShareCodecSelection} from '@app/features/voice/utils/CodecCapabilityDetector';
import {CODEC_DISPLAY_LABEL} from '@app/features/voice/utils/ScreenShareCodecPolicy';
import type {I18n} from '@lingui/core';
import {msg} from '@lingui/core/macro';

const AUTO_DESCRIPTION_FIREFOX_VP8_DESCRIPTOR = msg({
	message: 'Automatic would use {codecName} because Firefox screen sharing works most reliably with it.',
	comment:
		'Description shown under the Automatic option in the screen-share codec radio group. {codecName} is a codec label such as VP8 and should not be translated. Keep Firefox as a product name.',
});
const AUTO_DESCRIPTION_NON_CHROMIUM_H264_DESCRIPTOR = msg({
	message:
		'Automatic would use {codecName} because this browser supports it and it is the best fallback outside Chromium.',
	comment:
		'Description shown under the Automatic option in the screen-share codec radio group. {codecName} is a codec label such as H.264 and should not be translated. Keep Chromium as a product name.',
});
const AUTO_DESCRIPTION_DESKTOP_NON_CHROMIUM_H264_DESCRIPTOR = msg({
	message:
		'Automatic would use {codecName} because your computer supports it and it is the best fallback outside Chromium.',
	comment:
		'Desktop-client description shown under the Automatic option in the screen-share codec radio group. {codecName} is a codec label such as H.264 and should not be translated. Keep Chromium as a product name.',
});
const AUTO_DESCRIPTION_NON_CHROMIUM_VP8_DESCRIPTOR = msg({
	message: 'Automatic would use {codecName} because this browser does not expose H.264, so VP8 is the safest fallback.',
	comment:
		'Description shown under the Automatic option in the screen-share codec radio group. {codecName} is a codec label such as VP8 and should not be translated. Keep codec names literal.',
});
const AUTO_DESCRIPTION_DESKTOP_NON_CHROMIUM_VP8_DESCRIPTOR = msg({
	message:
		'Automatic would use {codecName} because your computer does not expose H.264, so VP8 is the safest fallback.',
	comment:
		'Desktop-client description shown under the Automatic option in the screen-share codec radio group. {codecName} is a codec label such as VP8 and should not be translated. Keep codec names literal.',
});
const AUTO_DESCRIPTION_HARDWARE_AV1_DESCRIPTOR = msg({
	message:
		'Automatic would use {codecName} because your GPU can encode it in hardware, with the best compression for screen sharing.',
	comment:
		'Description shown under the Automatic option in the screen-share codec radio group. {codecName} is a codec label such as AV1 and should not be translated. Keep GPU as an acronym.',
});
const AUTO_DESCRIPTION_HARDWARE_H264_DESCRIPTOR = msg({
	message:
		'Automatic would use {codecName} because your GPU can encode it in hardware and it is the most compatible screen-share default.',
	comment:
		'Description shown under the Automatic option in the screen-share codec radio group. {codecName} is a codec label such as H.264 and should not be translated. Keep GPU as an acronym.',
});
const AUTO_DESCRIPTION_HARDWARE_H265_DESCRIPTOR = msg({
	message:
		'Automatic would use {codecName} because your GPU can encode it in hardware, with excellent compression and low CPU usage.',
	comment:
		'Description shown under the Automatic option in the screen-share codec radio group. {codecName} is a codec label such as H.265 and should not be translated. Keep GPU as an acronym.',
});
const AUTO_DESCRIPTION_HARDWARE_VP9_DESCRIPTOR = msg({
	message:
		'Automatic would use {codecName} because your GPU can encode it in hardware and it gives strong screen-share quality.',
	comment:
		'Description shown under the Automatic option in the screen-share codec radio group. {codecName} is a codec label such as VP9 and should not be translated. Keep GPU as an acronym.',
});
const AUTO_DESCRIPTION_SOFTWARE_AV1_DESCRIPTOR = msg({
	message: 'Automatic would use {codecName} because software encoding is preferred and this browser exposes AV1.',
	comment:
		'Description shown under the Automatic option in the screen-share codec radio group. {codecName} is a codec label such as AV1 and should not be translated.',
});
const AUTO_DESCRIPTION_DESKTOP_SOFTWARE_AV1_DESCRIPTOR = msg({
	message: 'Automatic would use {codecName} because software encoding is preferred and your computer exposes AV1.',
	comment:
		'Desktop-client description shown under the Automatic option in the screen-share codec radio group. {codecName} is a codec label such as AV1 and should not be translated.',
});
const AUTO_DESCRIPTION_SOFTWARE_H265_DESCRIPTOR = msg({
	message: 'Automatic would use {codecName} because no hardware encoder is available and this browser exposes H.265.',
	comment:
		'Description shown under the Automatic option in the screen-share codec radio group. {codecName} is a codec label such as H.265 and should not be translated.',
});
const AUTO_DESCRIPTION_DESKTOP_SOFTWARE_H265_DESCRIPTOR = msg({
	message: 'Automatic would use {codecName} because no hardware encoder is available and your computer exposes H.265.',
	comment:
		'Desktop-client description shown under the Automatic option in the screen-share codec radio group. {codecName} is a codec label such as H.265 and should not be translated.',
});
const AUTO_DESCRIPTION_SOFTWARE_VP9_DESCRIPTOR = msg({
	message: 'Automatic would use {codecName} because software encoding is preferred and this browser exposes VP9.',
	comment:
		'Description shown under the Automatic option in the screen-share codec radio group. {codecName} is a codec label such as VP9 and should not be translated.',
});
const AUTO_DESCRIPTION_DESKTOP_SOFTWARE_VP9_DESCRIPTOR = msg({
	message: 'Automatic would use {codecName} because software encoding is preferred and your computer exposes VP9.',
	comment:
		'Desktop-client description shown under the Automatic option in the screen-share codec radio group. {codecName} is a codec label such as VP9 and should not be translated.',
});
const AUTO_DESCRIPTION_SOFTWARE_H264_DESCRIPTOR = msg({
	message: 'Automatic would use {codecName} because no higher-quality encoder is available and H.264 is compatible.',
	comment:
		'Description shown under the Automatic option in the screen-share codec radio group. {codecName} is a codec label such as H.264 and should not be translated.',
});
const AUTO_DESCRIPTION_SOFTWARE_VP8_DESCRIPTOR = msg({
	message:
		'Automatic would use {codecName} because software encoding is preferred and VP8 is the safest software fallback.',
	comment:
		'Description shown under the Automatic option in the screen-share codec radio group. {codecName} is a codec label such as VP8 and should not be translated.',
});
const AUTO_DESCRIPTION_OPENH264_REQUIRED_DESCRIPTOR = msg({
	message:
		'Automatic would use {codecName} because no video encoder is exposed. On Linux, OpenH264 may need to be installed.',
	comment:
		'Description shown under the Automatic option in the screen-share codec radio group. {codecName} is a codec label such as H.264 and should not be translated. Keep OpenH264 and Linux literal.',
});

export function getAutomaticDescription(
	i18n: I18n,
	selection: AutomaticScreenShareCodecSelection,
	options: {isDesktopClient?: boolean} = {},
): string {
	const codecName = CODEC_DISPLAY_LABEL[selection.codec];
	switch (selection.reason) {
		case 'firefox-vp8':
			return i18n._(AUTO_DESCRIPTION_FIREFOX_VP8_DESCRIPTOR, {codecName});
		case 'non-chromium-h264':
			return i18n._(
				options.isDesktopClient
					? AUTO_DESCRIPTION_DESKTOP_NON_CHROMIUM_H264_DESCRIPTOR
					: AUTO_DESCRIPTION_NON_CHROMIUM_H264_DESCRIPTOR,
				{codecName},
			);
		case 'non-chromium-vp8':
			return i18n._(
				options.isDesktopClient
					? AUTO_DESCRIPTION_DESKTOP_NON_CHROMIUM_VP8_DESCRIPTOR
					: AUTO_DESCRIPTION_NON_CHROMIUM_VP8_DESCRIPTOR,
				{codecName},
			);
		case 'hardware-av1':
			return i18n._(AUTO_DESCRIPTION_HARDWARE_AV1_DESCRIPTOR, {codecName});
		case 'hardware-h265':
			return i18n._(AUTO_DESCRIPTION_HARDWARE_H265_DESCRIPTOR, {codecName});
		case 'hardware-h264':
			return i18n._(AUTO_DESCRIPTION_HARDWARE_H264_DESCRIPTOR, {codecName});
		case 'hardware-vp9':
			return i18n._(AUTO_DESCRIPTION_HARDWARE_VP9_DESCRIPTOR, {codecName});
		case 'software-av1':
			return i18n._(
				options.isDesktopClient
					? AUTO_DESCRIPTION_DESKTOP_SOFTWARE_AV1_DESCRIPTOR
					: AUTO_DESCRIPTION_SOFTWARE_AV1_DESCRIPTOR,
				{codecName},
			);
		case 'software-h265':
			return i18n._(
				options.isDesktopClient
					? AUTO_DESCRIPTION_DESKTOP_SOFTWARE_H265_DESCRIPTOR
					: AUTO_DESCRIPTION_SOFTWARE_H265_DESCRIPTOR,
				{codecName},
			);
		case 'software-vp9':
			return i18n._(
				options.isDesktopClient
					? AUTO_DESCRIPTION_DESKTOP_SOFTWARE_VP9_DESCRIPTOR
					: AUTO_DESCRIPTION_SOFTWARE_VP9_DESCRIPTOR,
				{codecName},
			);
		case 'software-h264':
			return i18n._(AUTO_DESCRIPTION_SOFTWARE_H264_DESCRIPTOR, {codecName});
		case 'software-vp8':
			return i18n._(AUTO_DESCRIPTION_SOFTWARE_VP8_DESCRIPTOR, {codecName});
		case 'openh264-required':
			return i18n._(AUTO_DESCRIPTION_OPENH264_REQUIRED_DESCRIPTOR, {codecName});
	}
}
