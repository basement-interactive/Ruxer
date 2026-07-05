// SPDX-License-Identifier: AGPL-3.0-or-later

import {isKeyboardActivationKey} from '@app/features/input/utils/KeyboardUtils';
import * as TextCopyCommands from '@app/features/ui/commands/TextCopyCommands';
import FocusRing from '@app/features/ui/focus_ring/FocusRing';
import styles from '@app/features/voice/components/VoiceConnectionStatus.module.css';
import type {I18n} from '@lingui/core';
import {LockSimpleIcon} from '@phosphor-icons/react';
import type {KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent} from 'react';

interface EndpointCopyBadgeProps {
	endpoint: string;
	i18n: I18n;
	label: string;
}

export function EndpointCopyBadge({endpoint, i18n, label}: EndpointCopyBadgeProps) {
	const copyEndpoint = async (event: ReactMouseEvent<HTMLElement> | ReactKeyboardEvent<HTMLElement>) => {
		event.stopPropagation();
		await TextCopyCommands.copy(i18n, endpoint);
	};
	return (
		<FocusRing offset={-2} data-flx="voice.voice-connection-status.endpoint-copy-badge.focus-ring">
			<div
				className={styles.endpointBadge}
				role="button"
				tabIndex={0}
				aria-label={label}
				onClick={copyEndpoint}
				onKeyDown={async (event) => {
					if (isKeyboardActivationKey(event.key)) {
						event.preventDefault();
						await copyEndpoint(event);
					}
				}}
				data-flx="voice.voice-connection-status.endpoint-copy-badge.endpoint-badge.copy-endpoint"
			>
				<LockSimpleIcon
					weight="fill"
					className={styles.lockIcon}
					data-flx="voice.voice-connection-status.endpoint-copy-badge.lock-icon"
				/>
				<span
					className={styles.endpointBadgeText}
					data-flx="voice.voice-connection-status.endpoint-copy-badge.endpoint-badge-text"
				>
					{endpoint}
				</span>
			</div>
		</FocusRing>
	);
}
