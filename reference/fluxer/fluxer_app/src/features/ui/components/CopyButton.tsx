// SPDX-License-Identifier: AGPL-3.0-or-later

import {COPIED_DESCRIPTOR} from '@app/features/i18n/utils/CommonMessageDescriptors';
import {stopPropagationOnEnterSpace} from '@app/features/input/utils/KeyboardUtils';
import * as TextCopyCommands from '@app/features/ui/commands/TextCopyCommands';
import FocusRing from '@app/features/ui/focus_ring/FocusRing';
import type {MessageDescriptor} from '@lingui/core';
import {useLingui} from '@lingui/react/macro';
import {CheckCircleIcon, ClipboardIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {useEffect, useRef, useState} from 'react';

const COPIED_FEEDBACK_DURATION_MS = 2000;

interface CopyButtonProps {
	value: string;
	label: MessageDescriptor;
	className?: string;
	visibleClassName?: string;
	buttonClassName?: string;
	iconClassName?: string;
	disabled?: boolean;
}

export function CopyButton({
	value,
	label,
	className,
	visibleClassName,
	buttonClassName,
	iconClassName,
	disabled,
}: CopyButtonProps) {
	const {i18n} = useLingui();
	const [isCopied, setIsCopied] = useState(false);
	const resetTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	useEffect(
		() => () => {
			if (resetTimeoutRef.current != null) {
				clearTimeout(resetTimeoutRef.current);
			}
		},
		[],
	);
	const handleCopy = () => {
		TextCopyCommands.copy(i18n, value);
		setIsCopied(true);
		if (resetTimeoutRef.current != null) {
			clearTimeout(resetTimeoutRef.current);
		}
		resetTimeoutRef.current = setTimeout(() => setIsCopied(false), COPIED_FEEDBACK_DURATION_MS);
	};
	return (
		<div className={clsx(className, isCopied && visibleClassName)} data-flx="ui.copy-button.div">
			<FocusRing offset={-2} data-flx="ui.copy-button.focus-ring">
				<button
					type="button"
					onClick={handleCopy}
					onKeyDown={stopPropagationOnEnterSpace}
					aria-label={isCopied ? i18n._(COPIED_DESCRIPTOR) : i18n._(label)}
					className={buttonClassName}
					disabled={disabled}
					data-flx="ui.copy-button.button.copy"
				>
					{isCopied ? (
						<CheckCircleIcon className={iconClassName} data-flx="ui.copy-button.check-circle-icon" />
					) : (
						<ClipboardIcon className={iconClassName} data-flx="ui.copy-button.clipboard-icon" />
					)}
				</button>
			</FocusRing>
		</div>
	);
}
