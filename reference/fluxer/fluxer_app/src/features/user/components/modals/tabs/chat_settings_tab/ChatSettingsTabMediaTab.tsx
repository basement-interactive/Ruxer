// SPDX-License-Identifier: AGPL-3.0-or-later

import * as AccessibilityCommands from '@app/features/accessibility/commands/AccessibilityCommands';
import Accessibility, {MediaDimensionSize} from '@app/features/accessibility/state/Accessibility';
import type {RadioOption} from '@app/features/ui/radio_group/RadioGroup';
import {RadioGroup} from '@app/features/ui/radio_group/RadioGroup';
import styles from '@app/features/user/components/modals/tabs/chat_settings_tab/ChatSettingsTabMediaTab.module.css';
import {msg} from '@lingui/core/macro';
import {Trans, useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useMemo} from 'react';

const COMPACT_400X300_DESCRIPTOR = msg({
	message: 'Compact (400x300)',
	comment: 'Short label in the media tab. Keep it concise.',
});
const SMALLER_MEDIA_SIZE_DESCRIPTOR = msg({
	message: 'Smaller media size',
	comment: 'Short label in the media tab. Keep it concise.',
});
const COMFORTABLE_550X400_DESCRIPTOR = msg({
	message: 'Comfortable (550x400)',
	comment: 'Short label in the media tab. Keep it concise.',
});
const LARGER_MEDIA_SIZE_WITH_MORE_DETAIL_DESCRIPTOR = msg({
	message: 'Larger media size with more detail',
	comment: 'Description text in the media tab.',
});
const SELECT_MEDIA_SIZE_FOR_EMBEDDED_CONTENT_FROM_LINKS_DESCRIPTOR = msg({
	message: 'Select media size for embedded content from links',
	comment: 'Button or menu action label in the media tab. Keep it concise.',
});
const SELECT_MEDIA_SIZE_FOR_UPLOADED_ATTACHMENTS_DESCRIPTOR = msg({
	message: 'Select media size for uploaded attachments',
	comment: 'Button or menu action label in the media tab. Keep it concise.',
});

export const MediaTabContent: React.FC = observer(() => {
	const {i18n} = useLingui();
	const {embedMediaDimensionSize, attachmentMediaDimensionSize} = Accessibility;
	const mediaSizeOptions = useMemo(
		(): ReadonlyArray<RadioOption<MediaDimensionSize>> => [
			{
				value: MediaDimensionSize.SMALL,
				name: i18n._(COMPACT_400X300_DESCRIPTOR),
				desc: i18n._(SMALLER_MEDIA_SIZE_DESCRIPTOR),
			},
			{
				value: MediaDimensionSize.LARGE,
				name: i18n._(COMFORTABLE_550X400_DESCRIPTOR),
				desc: i18n._(LARGER_MEDIA_SIZE_WITH_MORE_DETAIL_DESCRIPTOR),
			},
		],
		[i18n.locale],
	);
	return (
		<div className={styles.radioSections} data-flx="user.chat-settings-tab.media-tab.media-tab-content.radio-sections">
			<div className={styles.radioSection} data-flx="user.chat-settings-tab.media-tab.media-tab-content.radio-section">
				<div
					className={styles.radioLabelContainer}
					data-flx="user.chat-settings-tab.media-tab.media-tab-content.radio-label-container"
				>
					<div className={styles.radioLabel} data-flx="user.chat-settings-tab.media-tab.media-tab-content.radio-label">
						<Trans>Media from links (embeds)</Trans>
					</div>
				</div>
				<RadioGroup
					options={mediaSizeOptions}
					value={embedMediaDimensionSize}
					onChange={(value) => AccessibilityCommands.update({embedMediaDimensionSize: value})}
					aria-label={i18n._(SELECT_MEDIA_SIZE_FOR_EMBEDDED_CONTENT_FROM_LINKS_DESCRIPTOR)}
					data-flx="user.chat-settings-tab.media-tab.media-tab-content.radio-group.update"
				/>
			</div>
			<div
				className={styles.radioSection}
				data-flx="user.chat-settings-tab.media-tab.media-tab-content.radio-section--2"
			>
				<div
					className={styles.radioLabelContainer}
					data-flx="user.chat-settings-tab.media-tab.media-tab-content.radio-label-container--2"
				>
					<div
						className={styles.radioLabel}
						data-flx="user.chat-settings-tab.media-tab.media-tab-content.radio-label--2"
					>
						<Trans>Uploaded attachments</Trans>
					</div>
				</div>
				<RadioGroup
					options={mediaSizeOptions}
					value={attachmentMediaDimensionSize}
					onChange={(value) => AccessibilityCommands.update({attachmentMediaDimensionSize: value})}
					aria-label={i18n._(SELECT_MEDIA_SIZE_FOR_UPLOADED_ATTACHMENTS_DESCRIPTOR)}
					data-flx="user.chat-settings-tab.media-tab.media-tab-content.radio-group.update--2"
				/>
			</div>
		</div>
	);
});
