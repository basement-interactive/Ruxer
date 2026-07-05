// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/auth/flow/AuthPageStyles.module.css';
import type {Gift} from '@app/features/gift/commands/GiftCommands';
import {getPremiumGiftDurationText} from '@app/features/gift/utils/GiftUtils';
import * as NicknameUtils from '@app/features/user/utils/NicknameUtils';
import {Trans, useLingui} from '@lingui/react/macro';
import {GiftIcon} from '@phosphor-icons/react';

interface GiftHeaderProps {
	gift: Gift;
	variant: 'login' | 'register';
}

export function GiftHeader({gift, variant}: GiftHeaderProps) {
	const {i18n} = useLingui();
	const durationText = getPremiumGiftDurationText(i18n, gift);
	const sender = gift.created_by ? NicknameUtils.getDisplayName(gift.created_by) : null;
	return (
		<div className={styles.entityHeader} data-flx="auth.flow.gift-header.entity-header">
			<div className={styles.giftIconContainer} data-flx="auth.flow.gift-header.gift-icon-container">
				<GiftIcon className={styles.giftIcon} data-flx="auth.flow.gift-header.gift-icon" />
			</div>
			<div className={styles.entityDetails} data-flx="auth.flow.gift-header.entity-details">
				<p className={styles.entityText} data-flx="auth.flow.gift-header.entity-text">
					{sender ? <Trans>{sender} sent you a gift</Trans> : <Trans>You've received a gift</Trans>}
				</p>
				<h2 className={styles.entityTitle} data-flx="auth.flow.gift-header.entity-title">
					{durationText}
				</h2>
				<p className={styles.entitySubtext} data-flx="auth.flow.gift-header.entity-subtext">
					{variant === 'login' ? (
						<Trans>Sign in to claim your gift</Trans>
					) : (
						<Trans>Create an account to claim your gift</Trans>
					)}
				</p>
			</div>
		</div>
	);
}
