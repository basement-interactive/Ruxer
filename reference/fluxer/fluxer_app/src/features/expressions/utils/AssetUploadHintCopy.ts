// SPDX-License-Identifier: AGPL-3.0-or-later

import type {MessageDescriptor} from '@lingui/core';
import {msg} from '@lingui/core/macro';

const IMAGE_UPLOAD_RECOMMENDED_HINT_DESCRIPTOR = msg({
	message: '{formats}. Max {maxSize}. Recommended: {recommendedSize}',
	comment:
		'Helper text in an asset upload source modal. formats is a formatted list of accepted file types; maxSize is a formatted file size; recommendedSize is a recommended image size.',
});
const IMAGE_UPLOAD_RECOMMENDED_HINT_WITH_NOTE_DESCRIPTOR = msg({
	message: '{formats}. Max {maxSize}. Recommended: {recommendedSize}. {note}',
	comment:
		'Helper text in an asset upload source modal with an extra note. formats is a formatted list of accepted file types; maxSize is a formatted file size; recommendedSize is a recommended image size.',
});
const IMAGE_UPLOAD_MINIMUM_HINT_DESCRIPTOR = msg({
	message: '{formats}. Max {maxSize}. Minimum: {minimumSize} ({aspectRatio})',
	comment:
		'Helper text in an asset upload source modal. formats is a formatted list of accepted file types; maxSize is a formatted file size; minimumSize is a minimum image size; aspectRatio is a formatted aspect ratio.',
});
const IMAGE_UPLOAD_MINIMUM_HINT_WITH_NOTE_DESCRIPTOR = msg({
	message: '{formats}. Max {maxSize}. Minimum: {minimumSize} ({aspectRatio}). {note}',
	comment:
		'Helper text in an asset upload source modal with an extra note. formats is a formatted list of accepted file types; maxSize is a formatted file size; minimumSize is a minimum image size; aspectRatio is a formatted aspect ratio.',
});

interface RecommendedImageUploadHintOptions {
	formats: string;
	maxSize: string;
	recommendedSize: string;
}

interface RecommendedImageUploadHintWithNoteOptions extends RecommendedImageUploadHintOptions {
	note: string;
}

interface MinimumImageUploadHintOptions {
	formats: string;
	maxSize: string;
	minimumSize: string;
	aspectRatio: string;
}

interface MinimumImageUploadHintWithNoteOptions extends MinimumImageUploadHintOptions {
	note: string;
}

interface AssetUploadHintI18n {
	_(descriptor: MessageDescriptor, values?: object): string;
}

export function formatImageUploadRecommendedHint(
	i18n: AssetUploadHintI18n,
	options: RecommendedImageUploadHintOptions,
): string {
	return i18n._(IMAGE_UPLOAD_RECOMMENDED_HINT_DESCRIPTOR, options);
}

export function formatImageUploadRecommendedHintWithNote(
	i18n: AssetUploadHintI18n,
	options: RecommendedImageUploadHintWithNoteOptions,
): string {
	return i18n._(IMAGE_UPLOAD_RECOMMENDED_HINT_WITH_NOTE_DESCRIPTOR, options);
}

export function formatImageUploadMinimumHint(
	i18n: AssetUploadHintI18n,
	options: MinimumImageUploadHintOptions,
): string {
	return i18n._(IMAGE_UPLOAD_MINIMUM_HINT_DESCRIPTOR, options);
}

export function formatImageUploadMinimumHintWithNote(
	i18n: AssetUploadHintI18n,
	options: MinimumImageUploadHintWithNoteOptions,
): string {
	return i18n._(IMAGE_UPLOAD_MINIMUM_HINT_WITH_NOTE_DESCRIPTOR, options);
}
