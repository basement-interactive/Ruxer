// SPDX-License-Identifier: AGPL-3.0-or-later

import type {User} from '@app/features/user/models/User';
import styles from '@app/features/voice/components/PiPOverlay.module.css';
import {EyeIcon, PhoneXIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import type React from 'react';

interface PiPFooterProps {
	displayName: string;
	isScreenShare: boolean;
	viewerUsers: ReadonlyArray<User>;
	disconnectLabel: string;
	onDisconnect: (event: React.MouseEvent) => void;
}

export function PiPFooter({displayName, isScreenShare, viewerUsers, disconnectLabel, onDisconnect}: PiPFooterProps) {
	return (
		<div className={styles.footerGradient} data-flx="voice.pi-p-overlay.pi-p-overlay-inner.footer-gradient">
			<div className={styles.footerContent} data-flx="voice.pi-p-overlay.pi-p-overlay-inner.footer-content">
				<div className={styles.footerLeft} data-flx="voice.pi-p-overlay.pi-p-overlay-inner.footer-left">
					<span className={styles.streamerName} data-flx="voice.pi-p-overlay.pi-p-overlay-inner.streamer-name">
						{displayName}
					</span>
				</div>
				<div className={styles.footerRight} data-flx="voice.pi-p-overlay.pi-p-overlay-inner.footer-right">
					{isScreenShare && viewerUsers.length > 0 && (
						<div className={styles.spectatorBadge} data-flx="voice.pi-p-overlay.pi-p-overlay-inner.spectator-badge">
							<EyeIcon
								weight="fill"
								className={styles.spectatorIcon}
								data-flx="voice.pi-p-overlay.pi-p-overlay-inner.spectator-icon"
							/>
							<span data-flx="voice.pi-p-overlay.pi-p-overlay-inner.span">{viewerUsers.length}</span>
						</div>
					)}
					{!isScreenShare && (
						<button
							type="button"
							className={clsx(styles.actionButton, styles.disconnectButton)}
							onClick={onDisconnect}
							onPointerDown={(e) => e.stopPropagation()}
							aria-label={disconnectLabel}
							data-flx="voice.pi-p-overlay.pi-p-overlay-inner.action-button.disconnect"
						>
							<PhoneXIcon
								weight="fill"
								className={styles.actionIcon}
								data-flx="voice.pi-p-overlay.pi-p-overlay-inner.action-icon--2"
							/>
						</button>
					)}
				</div>
			</div>
		</div>
	);
}
