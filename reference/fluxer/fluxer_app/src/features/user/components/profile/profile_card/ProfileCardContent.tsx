// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/user/components/profile/profile_card/ProfileCardContent.module.css';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import type React from 'react';

interface ProfileCardContentProps {
	children: React.ReactNode;
	isWebhook?: boolean;
}

export const ProfileCardContent: React.FC<ProfileCardContentProps> = observer(({children, isWebhook = false}) => {
	return (
		<div
			className={clsx(styles.contentSection, isWebhook && styles.contentSectionWebhook)}
			data-flx="user.profile.profile-card.profile-card-content.content-section"
		>
			{children}
		</div>
	);
});
