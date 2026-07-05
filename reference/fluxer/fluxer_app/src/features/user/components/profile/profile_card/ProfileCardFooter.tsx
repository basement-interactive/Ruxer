// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/user/components/profile/profile_card/ProfileCardFooter.module.css';
import {observer} from 'mobx-react-lite';
import type React from 'react';

interface ProfileCardFooterProps {
	children: React.ReactNode;
}

export const ProfileCardFooter: React.FC<ProfileCardFooterProps> = observer(({children}) => {
	return (
		<footer className={styles.footerSection} data-flx="user.profile.profile-card.profile-card-footer.footer-section">
			{children}
		</footer>
	);
});
