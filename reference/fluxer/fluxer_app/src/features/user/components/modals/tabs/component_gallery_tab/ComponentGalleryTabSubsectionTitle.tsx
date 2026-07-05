// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/user/components/modals/tabs/component_gallery_tab/shared.module.css';
import {observer} from 'mobx-react-lite';
import type React from 'react';

export const SubsectionTitle: React.FC<{children: React.ReactNode}> = observer(({children}) => (
	<h4
		className={styles.subsectionTitle}
		data-flx="user.component-gallery-tab.component-gallery-tab-subsection-title.subsection-title.subsection-title"
	>
		{children}
	</h4>
));
