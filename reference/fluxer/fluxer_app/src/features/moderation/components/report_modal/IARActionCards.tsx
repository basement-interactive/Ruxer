// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/moderation/components/report_modal/IARModal.module.css';
import type {IARActionCardConfig} from '@app/features/moderation/components/report_modal/IARModalTypes';
import {Button} from '@app/features/ui/button/Button';
import {Tooltip} from '@app/features/ui/tooltip/Tooltip';
import type React from 'react';

interface IARActionCardsProps {
	cards: ReadonlyArray<IARActionCardConfig>;
}

const IARActionCardButton: React.FC<{card: IARActionCardConfig}> = ({card}) => {
	const button = (
		<Button
			variant={card.buttonVariant ?? 'secondary'}
			small
			fitContent
			disabled={card.disabled}
			onClick={card.disabled ? undefined : card.onClick}
			data-flx="moderation.iar-action-cards.button.click"
		>
			{card.label}
		</Button>
	);
	if (card.disabled && card.disabledTooltip) {
		return (
			<Tooltip text={card.disabledTooltip} data-flx="moderation.iar-action-cards.disabled-tooltip">
				<span data-flx="moderation.iar-action-cards.button-wrap">{button}</span>
			</Tooltip>
		);
	}
	return button;
};
export const IARActionCards: React.FC<IARActionCardsProps> = ({cards}) => {
	if (cards.length === 0) {
		return null;
	}
	return (
		<div className={styles.actionListWrap} data-flx="moderation.iar-action-cards.action-list-wrap">
			<div className={styles.actionList} data-flx="moderation.iar-action-cards.action-list">
				{cards.map((card) => (
					<div key={card.id} className={styles.actionRow} data-flx="moderation.iar-action-cards.action-row">
						<div className={styles.actionRowText} data-flx="moderation.iar-action-cards.action-row-text">
							<div className={styles.actionRowTitle} data-flx="moderation.iar-action-cards.action-row-title">
								{card.title}
							</div>
							<div className={styles.actionRowDesc} data-flx="moderation.iar-action-cards.action-row-desc">
								{card.description}
							</div>
						</div>
						<IARActionCardButton
							card={card}
							data-flx="moderation.report-modal.iar-action-cards.iar-action-card-button"
						/>
					</div>
				))}
			</div>
		</div>
	);
};
