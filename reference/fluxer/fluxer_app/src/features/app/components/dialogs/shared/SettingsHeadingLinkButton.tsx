// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/app/components/dialogs/shared/SettingsHeadingLinkButton.module.css';
import {COPIED_DESCRIPTOR} from '@app/features/i18n/utils/CommonMessageDescriptors';
import {stopPropagationOnEnterSpace} from '@app/features/input/utils/KeyboardUtils';
import * as TextCopyCommands from '@app/features/ui/commands/TextCopyCommands';
import FocusRing from '@app/features/ui/focus_ring/FocusRing';
import {Tooltip} from '@app/features/ui/tooltip/Tooltip';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {CheckIcon, LinkIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import type React from 'react';
import {useCallback, useEffect, useRef, useState} from 'react';

const COPIED_FEEDBACK_DURATION_MS = 2000;
const COPY_LINK_TO_SECTION_DESCRIPTOR = msg({
	message: 'Copy link to section',
	comment: 'Tooltip and aria label for a settings section heading action that copies a deep link to that section.',
});
const COPY_LINK_TO_PAGE_DESCRIPTOR = msg({
	message: 'Copy link to page',
	comment: 'Tooltip and aria label for a settings page header action that copies a deep link to that page.',
});

interface SettingsHeadingLinkButtonProps {
	href: string;
	className?: string;
	target?: 'section' | 'page';
}

export const SettingsHeadingLinkButton: React.FC<SettingsHeadingLinkButtonProps> = ({
	href,
	className,
	target = 'section',
}) => {
	const {i18n} = useLingui();
	const [copied, setCopied] = useState(false);
	const timeoutRef = useRef<NodeJS.Timeout | null>(null);
	const copyLabel = i18n._(target === 'page' ? COPY_LINK_TO_PAGE_DESCRIPTOR : COPY_LINK_TO_SECTION_DESCRIPTOR);
	const buttonLabel = copied ? i18n._(COPIED_DESCRIPTOR) : copyLabel;
	const handleCopy = useCallback(
		async (event: React.MouseEvent<HTMLButtonElement>) => {
			event.stopPropagation();
			const success = await TextCopyCommands.copy(i18n, href);
			if (!success) return;
			setCopied(true);
			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current);
			}
			timeoutRef.current = setTimeout(() => setCopied(false), COPIED_FEEDBACK_DURATION_MS);
		},
		[href, i18n],
	);
	useEffect(() => {
		return () => {
			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current);
			}
		};
	}, []);
	return (
		<Tooltip text={buttonLabel} data-flx="app.settings-heading-link-button.tooltip">
			<FocusRing offset={-2} data-flx="app.settings-heading-link-button.focus-ring">
				<button
					type="button"
					className={clsx(styles.button, copied && styles.buttonCopied, className)}
					onClick={handleCopy}
					onKeyDown={stopPropagationOnEnterSpace}
					aria-label={buttonLabel}
					data-flx="app.settings-heading-link-button.button.copy"
				>
					{copied ? (
						<CheckIcon className={styles.icon} weight="bold" data-flx="app.settings-heading-link-button.check-icon" />
					) : (
						<LinkIcon className={styles.icon} weight="bold" data-flx="app.settings-heading-link-button.link-icon" />
					)}
				</button>
			</FocusRing>
		</Tooltip>
	);
};
