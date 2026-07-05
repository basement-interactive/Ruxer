// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/guild/components/UploadSlotInfo.module.css';
import {Button} from '@app/features/ui/button/Button';
import {UploadIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import type React from 'react';

interface UploadSlotInfoProps {
	title: React.ReactNode;
	currentCount: number;
	maxCount: number;
	description: React.ReactNode;
	uploadButtonText: React.ReactNode;
	onUploadClick: () => void;
	additionalSlots?: React.ReactNode;
}

export const UploadSlotInfo: React.FC<UploadSlotInfoProps> = observer(
	({title, currentCount, maxCount, description, uploadButtonText, onUploadClick, additionalSlots}) => {
		const maxSlotCount = maxCount === Number.POSITIVE_INFINITY ? '∞' : maxCount;
		return (
			<div className={styles.container} data-flx="guild.upload-slot-info.container">
				<div className={styles.header} data-flx="guild.upload-slot-info.header">
					<div data-flx="guild.upload-slot-info.div">
						<h3 className={styles.title} data-flx="guild.upload-slot-info.title">
							{title}
						</h3>
						<div className={styles.stats} data-flx="guild.upload-slot-info.stats">
							{additionalSlots || (
								<span data-flx="guild.upload-slot-info.span">
									{currentCount} / {maxSlotCount}
								</span>
							)}
						</div>
					</div>
					<div className={styles.uploadButtonDesktop} data-flx="guild.upload-slot-info.upload-button-desktop">
						<Button
							onClick={onUploadClick}
							leftIcon={<UploadIcon className={styles.icon} data-flx="guild.upload-slot-info.icon" />}
							data-flx="guild.upload-slot-info.button.upload-click"
						>
							{uploadButtonText}
						</Button>
					</div>
				</div>
				<p className={styles.description} data-flx="guild.upload-slot-info.description">
					{description}
				</p>
				<div className={styles.uploadButtonMobile} data-flx="guild.upload-slot-info.upload-button-mobile">
					<Button
						onClick={onUploadClick}
						leftIcon={<UploadIcon className={styles.icon} data-flx="guild.upload-slot-info.icon--2" />}
						data-flx="guild.upload-slot-info.button.upload-click--2"
					>
						{uploadButtonText}
					</Button>
				</div>
			</div>
		);
	},
);
