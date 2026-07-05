// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/channel/components/embeds/MatureMediaBlurOverlay.module.css';
import {MatureContentGateReason} from '@app/features/guild/state/GuildMatureContentAgree';
import {MatureMediaGateDetailsModal} from '@app/features/moderation/components/modals/MatureMediaGateDetailsModal';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {modal} from '@app/features/ui/commands/ModalCommands';
import {Tooltip} from '@app/features/ui/tooltip/Tooltip';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type {FC, MouseEvent} from 'react';
import {useCallback} from 'react';

const CLICK_FOR_DETAILS_DESCRIPTOR = msg({
	message: 'Click for details',
	comment: 'Description text in the channel and chat mature media blur overlay.',
});
const REVEAL_DESCRIPTOR = msg({
	message: 'Reveal',
	comment: 'Short label in the channel and chat mature media blur overlay. Keep it concise.',
});
const CLICK_TO_REVEAL_DESCRIPTOR = msg({
	message: 'Click to reveal',
	comment: 'Short label in the channel and chat mature media blur overlay. Keep it concise.',
});

interface MatureMediaBlurOverlayProps {
	reason: MatureContentGateReason;
	canReveal?: boolean;
	onReveal?: () => void;
}

export const MatureMediaBlurOverlay: FC<MatureMediaBlurOverlayProps> = observer(
	({reason, canReveal = false, onReveal}) => {
		const {i18n} = useLingui();
		const isGateReason =
			reason === MatureContentGateReason.GEO_RESTRICTED ||
			reason === MatureContentGateReason.MATURE_CONTENT_CHECK_REQUIRED;
		const handleOpenDetails = useCallback(
			(event: MouseEvent<HTMLButtonElement>) => {
				event.preventDefault();
				event.stopPropagation();
				if (!isGateReason) {
					return;
				}
				ModalCommands.push(
					modal(() => (
						<MatureMediaGateDetailsModal
							reason={reason}
							data-flx="channel.embeds.mature-media-blur-overlay.handle-open-details.mature-media-gate-details-modal"
						/>
					)),
				);
			},
			[isGateReason, reason],
		);
		if (isGateReason) {
			return (
				<div className={styles.revealOverlay} data-flx="channel.embeds.mature-media-blur-overlay.reveal-overlay">
					<Tooltip
						text={i18n._(CLICK_FOR_DETAILS_DESCRIPTOR)}
						position="top"
						data-flx="channel.embeds.mature-media-blur-overlay.tooltip"
					>
						<button
							type="button"
							className={styles.revealButton}
							onClick={handleOpenDetails}
							data-flx="channel.embeds.mature-media-blur-overlay.reveal-button.open-details"
						>
							{i18n._(REVEAL_DESCRIPTOR)}
						</button>
					</Tooltip>
				</div>
			);
		}
		if (!canReveal || !onReveal) return null;
		return (
			<div className={styles.revealOverlay} data-flx="channel.embeds.mature-media-blur-overlay.reveal-overlay--2">
				<Tooltip
					text={i18n._(CLICK_TO_REVEAL_DESCRIPTOR)}
					position="top"
					data-flx="channel.embeds.mature-media-blur-overlay.tooltip--2"
				>
					<button
						type="button"
						className={styles.revealButton}
						onClick={onReveal}
						data-flx="channel.embeds.mature-media-blur-overlay.reveal-button"
					>
						{i18n._(REVEAL_DESCRIPTOR)}
					</button>
				</Tooltip>
			</div>
		);
	},
);
