// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/channel/components/bottomsheets/ChannelDetailsBottomSheet.module.css';
import {getMuteDurationOptions} from '@app/features/channel/components/MuteOptions';
import {CheckIcon} from '@app/features/ui/action_menu/ContextMenuIcons';
import * as Sheet from '@app/features/ui/sheet/Sheet';
import type {MuteConfig} from '@app/features/user/models/UserGuildSettings';
import {Trans, useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import React, {useCallback} from 'react';

interface MuteDurationSheetProps {
	isOpen: boolean;
	onClose: () => void;
	isMuted: boolean;
	mutedText: string | null | undefined;
	muteConfig: MuteConfig | null | undefined;
	muteTitle: string;
	unmuteTitle: string;
	onMute: (duration: number | null) => void;
	onUnmute: () => void;
}

export const MuteDurationSheet: React.FC<MuteDurationSheetProps> = observer(
	({isOpen, onClose, isMuted, mutedText, muteConfig, muteTitle, unmuteTitle, onMute, onUnmute}) => {
		const {i18n} = useLingui();
		const handleMuteDuration = useCallback(
			(duration: number | null) => {
				onMute(duration);
			},
			[onMute],
		);
		const handleUnmute = useCallback(() => {
			onUnmute();
		}, [onUnmute]);
		return (
			<Sheet.Root
				isOpen={isOpen}
				onClose={onClose}
				snapPoints={[0, 1]}
				initialSnap={1}
				data-flx="app.mute-duration-sheet.sheet-root"
			>
				<Sheet.Handle data-flx="app.mute-duration-sheet.sheet-handle" />
				<Sheet.Header
					trailing={<Sheet.CloseButton onClick={onClose} data-flx="app.mute-duration-sheet.sheet-close-button" />}
					data-flx="app.mute-duration-sheet.sheet-header"
				>
					<Sheet.Title data-flx="app.mute-duration-sheet.sheet-title">{isMuted ? unmuteTitle : muteTitle}</Sheet.Title>
				</Sheet.Header>
				<Sheet.Content padding="none" data-flx="app.mute-duration-sheet.sheet-content">
					<div className={styles.muteSheetContainer} data-flx="app.mute-duration-sheet.mute-sheet-container">
						<div className={styles.muteSheetContent} data-flx="app.mute-duration-sheet.mute-sheet-content">
							{isMuted && mutedText ? (
								<>
									<div className={styles.muteStatusBanner} data-flx="app.mute-duration-sheet.mute-status-banner">
										<p className={styles.muteStatusText} data-flx="app.mute-duration-sheet.mute-status-text">
											<Trans>Currently: {mutedText}</Trans>
										</p>
									</div>
									<div
										className={styles.muteOptionsContainer}
										data-flx="app.mute-duration-sheet.mute-options-container"
									>
										<button
											type="button"
											onClick={handleUnmute}
											className={styles.muteOptionButton}
											data-flx="app.mute-duration-sheet.mute-option-button.unmute"
										>
											<span className={styles.muteOptionLabel} data-flx="app.mute-duration-sheet.mute-option-label">
												<Trans>Unmute</Trans>
											</span>
										</button>
									</div>
								</>
							) : (
								<div
									className={styles.muteOptionsContainer}
									data-flx="app.mute-duration-sheet.mute-options-container--2"
								>
									{getMuteDurationOptions(i18n).map((option, index, array) => {
										const isSelected =
											isMuted &&
											((option.value === null && !muteConfig?.end_time) ||
												(option.value !== null && muteConfig?.selected_time_window === option.value));
										return (
											<React.Fragment key={option.label}>
												<button
													type="button"
													aria-pressed={isSelected}
													onClick={() => handleMuteDuration(option.value)}
													className={styles.muteOptionButton}
													data-flx="app.mute-duration-sheet.mute-option-button.mute-duration"
												>
													<span
														className={styles.muteOptionLabel}
														data-flx="app.mute-duration-sheet.mute-option-label--2"
													>
														{option.label}
													</span>
													{isSelected && (
														<CheckIcon className={styles.iconMedium} data-flx="app.mute-duration-sheet.icon-medium" />
													)}
												</button>
												{index < array.length - 1 && (
													<div
														className={styles.muteOptionDivider}
														data-flx="app.mute-duration-sheet.mute-option-divider"
													/>
												)}
											</React.Fragment>
										);
									})}
								</div>
							)}
						</div>
					</div>
				</Sheet.Content>
			</Sheet.Root>
		);
	},
);
