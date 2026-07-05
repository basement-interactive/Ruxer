// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/voice/components/HiddenStreamPlaceholder.module.css';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {clsx} from 'clsx';
import type React from 'react';
import {useMemo} from 'react';

const PREVIEW_HIDDEN_DESCRIPTOR = msg({
	message: 'Preview hidden',
	comment:
		'Status text on the placeholder shown in the voice call view when the user has hidden a remote stream preview.',
});

interface HiddenStreamPlaceholderProps {
	className?: string;
	label?: string;
}

export function HiddenStreamPlaceholder({className, label}: HiddenStreamPlaceholderProps): React.ReactElement {
	const {i18n} = useLingui();
	const displayLabel = useMemo(() => label ?? i18n._(PREVIEW_HIDDEN_DESCRIPTOR), [label, i18n.locale]);
	return (
		<div className={clsx(styles.root, className)} data-flx="voice.hidden-stream-placeholder.root">
			<span className={styles.label} data-flx="voice.hidden-stream-placeholder.label">
				{displayLabel}
			</span>
		</div>
	);
}
