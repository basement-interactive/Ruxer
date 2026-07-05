// SPDX-License-Identifier: AGPL-3.0-or-later

import {isKeyboardActivationKey} from '@app/features/input/utils/KeyboardUtils';
import {useMatureMedia} from '@app/features/messaging/hooks/useMatureMedia';
import styles from '@app/features/theme/styles/MatureBlur.module.css';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import type {ReactElement} from 'react';
import React, {useCallback} from 'react';

const REVEAL_SENSITIVE_EMOJI_DESCRIPTOR = msg({
	message: 'Reveal sensitive emoji',
	comment: 'Accessible label for a blurred emoji button. Activating it reveals the emoji when allowed.',
});

interface MatureEmojiWrapperProps {
	mature: boolean;
	channelId: string | undefined;
	children: ReactElement<{className?: string}>;
}

export const MatureEmojiWrapper = observer(
	({mature, channelId, children}: MatureEmojiWrapperProps): ReactElement | null => {
		const {i18n} = useLingui();
		const {shouldBlur, shouldBlock, canReveal, reveal} = useMatureMedia(mature, channelId);
		const handleReveal = useCallback(
			(e: React.MouseEvent | React.KeyboardEvent) => {
				if (shouldBlur && canReveal) {
					e.preventDefault();
					e.stopPropagation();
					reveal();
				}
			},
			[shouldBlur, canReveal, reveal],
		);
		const handleKeyDown = useCallback(
			(e: React.KeyboardEvent) => {
				if (!isKeyboardActivationKey(e.key)) {
					return;
				}
				handleReveal(e);
			},
			[handleReveal],
		);
		if (shouldBlock) {
			return null;
		}
		if (shouldBlur) {
			if (!canReveal) {
				return (
					<span className={styles.matureBlurContainer} data-flx="app.mature-emoji-wrapper.mature-blur-container">
						{React.cloneElement(children, {
							className: clsx(children.props.className, styles.matureBlurred),
						})}
					</span>
				);
			}
			return (
				<span
					className={styles.matureBlurContainer}
					onClick={handleReveal}
					onKeyDown={handleKeyDown}
					role="button"
					tabIndex={0}
					aria-label={i18n._(REVEAL_SENSITIVE_EMOJI_DESCRIPTOR)}
					data-flx="app.mature-emoji-wrapper.mature-blur-container.reveal"
				>
					{React.cloneElement(children, {
						className: clsx(children.props.className, styles.matureBlurred),
					})}
				</span>
			);
		}
		return children;
	},
);
