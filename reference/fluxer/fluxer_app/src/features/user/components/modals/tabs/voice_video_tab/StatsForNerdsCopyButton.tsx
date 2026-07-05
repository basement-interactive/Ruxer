// SPDX-License-Identifier: AGPL-3.0-or-later

import {Button} from '@app/features/ui/button/Button';
import * as ToastCommands from '@app/features/ui/commands/ToastCommands';
import {
	COPIED_STATS_JSON_DESCRIPTOR,
	COPY_STATS_JSON_DESCRIPTOR,
} from '@app/features/voice/components/StatsForNerdsCopyDescriptors';
import {useStatsForNerds} from '@app/features/voice/components/useStatsForNerds';
import {buildStatsForNerdsCopyPayload} from '@app/features/voice/utils/StatsForNerdsCopy';
import {useLingui} from '@lingui/react/macro';
import {CopySimpleIcon} from '@phosphor-icons/react';
import type React from 'react';
import {useCallback, useState} from 'react';

export const StatsForNerdsCopyButton: React.FC = () => {
	const {i18n} = useLingui();
	const data = useStatsForNerds();
	const [copying, setCopying] = useState(false);
	const handleCopy = useCallback(async () => {
		if (copying) return;
		setCopying(true);
		try {
			let payload: Record<string, unknown>;
			try {
				payload = await buildStatsForNerdsCopyPayload(data);
			} catch {
				payload = {
					schemaVersion: 1,
					createdAt: new Date().toISOString(),
					statsForNerds: data,
				};
			}
			await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
			ToastCommands.createToast({
				type: 'success',
				children: i18n._(COPIED_STATS_JSON_DESCRIPTOR),
			});
		} finally {
			setCopying(false);
		}
	}, [copying, data, i18n]);
	return (
		<Button
			variant="secondary"
			fitContent
			leftIcon={<CopySimpleIcon size={16} data-flx="user.stats-for-nerds-copy-button.copy-icon" />}
			submitting={copying}
			onClick={() => void handleCopy()}
			data-flx="user.stats-for-nerds-copy-button.copy"
		>
			{i18n._(COPY_STATS_JSON_DESCRIPTOR)}
		</Button>
	);
};
