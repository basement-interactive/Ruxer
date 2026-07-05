// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/channel/components/GuildMembersPage.module.css';
import {clsx} from 'clsx';
import {motion} from 'framer-motion';

export function MembersTableProgressSlot({show}: {show: boolean}) {
	return (
		<div
			className={clsx(styles.progressSlot, show && styles.progressSlotVisible)}
			aria-hidden
			data-flx="channel.guild-members-page.members-table-progress-slot.progress-slot"
		>
			{show && (
				<div
					className={styles.progressTrack}
					data-flx="channel.guild-members-page.members-table-progress-slot.progress-track"
				>
					<motion.div
						className={styles.progressBar}
						animate={{x: ['-100%', '333%']}}
						transition={{
							duration: 1.4,
							repeat: Infinity,
							ease: 'easeInOut',
						}}
						data-flx="channel.guild-members-page.members-table-progress-slot.progress-bar"
					/>
				</div>
			)}
		</div>
	);
}
