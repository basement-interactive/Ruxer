// SPDX-License-Identifier: AGPL-3.0-or-later

import Accessibility from '@app/features/accessibility/state/Accessibility';
import styles from '@app/features/ui/components/MentionBadge.module.css';
import {getCurrentLocale} from '@app/features/user/utils/LocaleUtils';
import {formatCompactNumber, formatNumber} from '@pkgs/number_utils/src/NumberFormatting';
import {clsx} from 'clsx';
import {AnimatePresence, motion} from 'framer-motion';
import {observer} from 'mobx-react-lite';

const formatMentionCount = (mentionCount: number) => {
	const locale = getCurrentLocale();
	if (mentionCount > 99 && mentionCount < 1000) {
		return '99+';
	}
	if (mentionCount >= 1000) {
		return formatCompactNumber(mentionCount, locale, 0).replace(/\s/g, '');
	}
	return formatNumber(mentionCount, locale);
};

interface MentionBadgeProps {
	mentionCount: number;
	size?: 'small' | 'medium';
}

export const MentionBadge = observer(({mentionCount, size = 'medium'}: MentionBadgeProps) => {
	if (mentionCount === 0) {
		return null;
	}
	return (
		<div
			className={clsx(styles.badge, size === 'small' ? styles.badgeSmall : styles.badgeMedium)}
			data-flx="ui.mention-badge.badge"
		>
			{formatMentionCount(mentionCount)}
		</div>
	);
});
export const MentionBadgeAnimated = observer(({mentionCount, size = 'medium'}: MentionBadgeProps) => {
	const shouldAnimate = !Accessibility.useReducedMotion;
	if (!shouldAnimate) {
		return mentionCount > 0 ? (
			<MentionBadge
				mentionCount={mentionCount}
				size={size}
				data-flx="ui.mention-badge.mention-badge-animated.mention-badge"
			/>
		) : null;
	}
	return (
		<AnimatePresence initial={false} mode="wait" data-flx="ui.mention-badge.mention-badge-animated.animate-presence">
			{mentionCount > 0 && (
				<motion.div
					className={styles.animatedWrapper}
					initial={{opacity: 0, scale: 0.85}}
					animate={{opacity: 1, scale: 1}}
					exit={{opacity: 0, scale: 0.85}}
					transition={{type: 'spring', stiffness: 500, damping: 22}}
					data-flx="ui.mention-badge.mention-badge-animated.animated-wrapper"
				>
					<MentionBadge
						mentionCount={mentionCount}
						size={size}
						data-flx="ui.mention-badge.mention-badge-animated.mention-badge--2"
					/>
				</motion.div>
			)}
		</AnimatePresence>
	);
});
