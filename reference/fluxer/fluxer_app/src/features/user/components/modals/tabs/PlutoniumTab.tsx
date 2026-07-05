// SPDX-License-Identifier: AGPL-3.0-or-later

import {PlutoniumContent} from '@app/features/app/components/dialogs/components/PlutoniumContent';
import {observer} from 'mobx-react-lite';
import type React from 'react';

const PlutoniumTab: React.FC = observer(() => {
	return <PlutoniumContent data-flx="user.plutonium-tab.plutonium-content" />;
});

export default PlutoniumTab;
