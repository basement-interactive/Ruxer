// SPDX-License-Identifier: AGPL-3.0-or-later

import RuntimeConfig, {describeApiEndpoint} from '@app/features/app/state/RuntimeConfig';
import styles from '@app/features/auth/components/pages/LoginPage.module.css';
import {InstanceSelector} from '@app/features/auth/flow/InstanceSelector';
import clsx from 'clsx';
import {observer} from 'mobx-react-lite';
import {useEffect, useState} from 'react';

interface AuthInstanceSelectorControlProps {
	className?: string;
	dataFlx?: string;
}

export const AuthInstanceSelectorControl = observer(function AuthInstanceSelectorControl({
	className,
	dataFlx = 'auth.flow.auth-instance-selector-control.instance-selector',
}: AuthInstanceSelectorControlProps) {
	const [instanceUrl, setInstanceUrl] = useState(() => describeApiEndpoint(RuntimeConfig.apiEndpoint));
	useEffect(() => {
		setInstanceUrl(describeApiEndpoint(RuntimeConfig.apiEndpoint));
	}, [RuntimeConfig.apiEndpoint]);
	return (
		<div className={clsx(styles.instanceSection, className)} data-flx={dataFlx}>
			<InstanceSelector value={instanceUrl} onChange={setInstanceUrl} onInstanceDiscovered={setInstanceUrl} />
		</div>
	);
});
