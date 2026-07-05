// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/channel/components/direct_message/PersonalNotesWelcomeSection.module.css';
import {PERSONAL_NOTES_DESCRIPTOR} from '@app/features/i18n/utils/CommonMessageDescriptors';
import {StatusAwareAvatar} from '@app/features/ui/components/StatusAwareAvatar';
import Users from '@app/features/user/state/Users';
import {msg} from '@lingui/core/macro';
import {Trans, useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';

const DECORATIVE_DIVIDER_DESCRIPTOR = msg({
	message: 'Decorative divider',
	comment: 'Short label in the channel and chat personal notes welcome section. Keep it concise.',
});

interface PersonalNotesWelcomeSectionProps {
	userId: string;
}

export const PersonalNotesWelcomeSection: React.FC<PersonalNotesWelcomeSectionProps> = observer(({userId}) => {
	const {i18n} = useLingui();
	const user = Users.getUser(userId);
	if (!user) {
		return null;
	}
	return (
		<div
			className={styles.welcomeSection}
			data-flx="channel.direct-message.personal-notes-welcome-section.welcome-section"
		>
			<div
				className={styles.avatarContainer}
				data-flx="channel.direct-message.personal-notes-welcome-section.avatar-container"
			>
				<div
					className={styles.avatarBackground}
					data-flx="channel.direct-message.personal-notes-welcome-section.avatar-background"
				/>
				<StatusAwareAvatar
					user={user}
					size={80}
					disablePresence={true}
					className={styles.avatar}
					data-flx="channel.direct-message.personal-notes-welcome-section.avatar"
				/>
			</div>
			<h1 className={styles.title} data-flx="channel.direct-message.personal-notes-welcome-section.title">
				{i18n._(PERSONAL_NOTES_DESCRIPTOR)}
			</h1>
			<div
				className={styles.dividerContainer}
				data-flx="channel.direct-message.personal-notes-welcome-section.divider-container"
			>
				<svg
					width="120"
					height="8"
					viewBox="0 0 120 8"
					className={styles.dividerSvg}
					role="img"
					aria-label={i18n._(DECORATIVE_DIVIDER_DESCRIPTOR)}
					data-flx="channel.direct-message.personal-notes-welcome-section.divider-svg"
				>
					<path
						d="M0,4 C10,0 15,8 25,4 C35,0 40,8 50,4 C60,0 65,8 75,4 C85,0 90,8 100,4 C110,0 115,8 120,4"
						stroke="currentColor"
						strokeWidth="1.5"
						fill="none"
						data-flx="channel.direct-message.personal-notes-welcome-section.path"
					/>
				</svg>
			</div>
			<p className={styles.description} data-flx="channel.direct-message.personal-notes-welcome-section.description">
				<Trans>Your private space for thoughts and reminders</Trans>
			</p>
		</div>
	);
});
