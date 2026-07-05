// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/ui/character_counter/CharacterCountAnnouncer.module.css';
import {
	CHARACTER_LIMIT_EXCEEDED_BY_DESCRIPTOR,
	CHARACTERS_LEFT_DESCRIPTOR,
} from '@app/features/ui/character_counter/CharacterCountMessages';
import {useLingui} from '@lingui/react/macro';
import {useEffect, useState} from 'react';

const NEARING_LIMIT_THRESHOLD = 50;
const ANNOUNCE_DEBOUNCE_MS = 400;

function useDebouncedValue<T>(value: T, delayMs: number): T {
	const [debounced, setDebounced] = useState(value);
	useEffect(() => {
		const id = setTimeout(() => setDebounced(value), delayMs);
		return () => clearTimeout(id);
	}, [value, delayMs]);
	return debounced;
}

interface CharacterCountAnnouncerProps {
	currentLength: number;
	maxLength: number;
}

export function CharacterCountAnnouncer({currentLength, maxLength}: CharacterCountAnnouncerProps) {
	const {i18n} = useLingui();
	const debouncedLength = useDebouncedValue(currentLength, ANNOUNCE_DEBOUNCE_MS);
	const remaining = maxLength - debouncedLength;
	const hasLimit = maxLength > 0;
	const isOverLimit = remaining < 0;
	const isNearingLimit = remaining >= 0 && remaining <= NEARING_LIMIT_THRESHOLD;

	const politeMessage = hasLimit && isNearingLimit ? i18n._(CHARACTERS_LEFT_DESCRIPTOR, {remaining}) : '';
	const assertiveMessage =
		hasLimit && isOverLimit ? i18n._(CHARACTER_LIMIT_EXCEEDED_BY_DESCRIPTOR, {remaining: -remaining}) : '';

	return (
		<>
			<span
				className={styles.srOnly}
				role="status"
				aria-live="polite"
				data-flx="ui.character-counter.character-count-announcer.polite"
			>
				{politeMessage}
			</span>
			<span
				className={styles.srOnly}
				role="alert"
				aria-live="assertive"
				data-flx="ui.character-counter.character-count-announcer.assertive"
			>
				{assertiveMessage}
			</span>
		</>
	);
}
