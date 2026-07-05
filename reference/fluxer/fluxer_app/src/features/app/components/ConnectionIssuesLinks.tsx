// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/app/components/ConnectionIssuesLinks.module.css';
import type {StatusPageIncident} from '@app/features/user/state/StatusPage';
import {ExternalUrls} from '@fluxer/constants/src/ExternalUrls';
import {Trans} from '@lingui/react/macro';

interface ConnectionIssuesLinksProps {
	incident: StatusPageIncident | null;
	className?: string;
}

const STATUS_HISTORY_URL = `${ExternalUrls.SERVICE_STATUS}/history`;

export function ConnectionIssuesLinks({incident, className}: ConnectionIssuesLinksProps) {
	const containerClassName = className != null ? `${styles.container} ${className}` : styles.container;
	const incidentUrl = incident?.url ?? STATUS_HISTORY_URL;
	return (
		<div className={containerClassName} data-flx="app.connection-issues-links.div">
			<p className={styles.prompt} data-flx="app.connection-issues-links.prompt">
				<Trans>Connection issues?</Trans>
			</p>
			<p className={styles.links} data-flx="app.connection-issues-links.links">
				<a
					href={ExternalUrls.SERVICE_STATUS}
					target="_blank"
					rel="noopener noreferrer"
					className={styles.link}
					data-flx="app.connection-issues-links.link"
				>
					<Trans>Status page</Trans>
				</a>
				<span aria-hidden="true" className={styles.separator} data-flx="app.connection-issues-links.separator">
					·
				</span>
				<a
					href={incidentUrl}
					target="_blank"
					rel="noopener noreferrer"
					className={styles.link}
					data-flx="app.connection-issues-links.link--2"
				>
					{incident ? <Trans>Read incident</Trans> : <Trans>Incident history</Trans>}
				</a>
			</p>
		</div>
	);
}
