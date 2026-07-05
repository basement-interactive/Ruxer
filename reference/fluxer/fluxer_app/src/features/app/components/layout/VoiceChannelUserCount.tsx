// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/app/components/layout/VoiceChannelUserCount.module.css';
import {observer} from 'mobx-react-lite';

interface VoiceChannelUserCountProps {
	currentUserCount: number;
	userLimit: number;
}

export const VoiceChannelUserCount = observer(function VoiceChannelUserCount({
	currentUserCount,
	userLimit,
}: VoiceChannelUserCountProps) {
	return (
		<div className={styles.wrapper} data-flx="app.voice-channel-user-count.wrapper">
			<span className={styles.users} data-flx="app.voice-channel-user-count.users">
				{currentUserCount.toString().padStart(2, '0')}
			</span>
			<span className={styles.total} data-flx="app.voice-channel-user-count.total">
				{userLimit.toString().padStart(2, '0')}
			</span>
		</div>
	);
});
