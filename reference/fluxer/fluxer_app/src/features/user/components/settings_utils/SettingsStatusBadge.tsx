// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	isSettingsItemExperimental,
	isSettingsItemNew,
	type SettingsMetadata,
	type SettingsStatusBadgeKind,
} from '@app/features/user/components/settings_utils/SettingsMetadata';
import styles from '@app/features/user/components/settings_utils/SettingsStatusBadge.module.css';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {clsx} from 'clsx';

const NEW_DESCRIPTOR = msg({
	message: 'NEW',
	comment: 'Compact badge shown beside recently added settings.',
});
const EXPERIMENTAL_DESCRIPTOR = msg({
	message: 'EXPERIMENTAL',
	comment: 'Compact badge shown beside settings that enable experimental behavior.',
});

interface SettingsStatusBadgeProps {
	kind: 'new' | SettingsStatusBadgeKind;
	className?: string;
}

export function SettingsStatusBadge({kind, className}: SettingsStatusBadgeProps) {
	const {i18n} = useLingui();
	const label = kind === 'new' ? i18n._(NEW_DESCRIPTOR) : i18n._(EXPERIMENTAL_DESCRIPTOR);
	return (
		<span
			className={clsx(styles.badge, kind === 'new' ? styles.new : styles.experimental, className)}
			data-flx="user.settings-status-badge.badge"
		>
			{label}
		</span>
	);
}

interface SettingsItemStatusBadgesProps {
	item: SettingsMetadata;
	userCreatedAt?: Date | null;
	className?: string;
}

export function SettingsItemStatusBadges({item, userCreatedAt, className}: SettingsItemStatusBadgesProps) {
	const showNew = isSettingsItemNew(item, Date.now(), userCreatedAt);
	const showExperimental = isSettingsItemExperimental(item);
	if (!showNew && !showExperimental) return null;
	return (
		<span className={clsx(styles.badges, className)} data-flx="user.settings-status-badge.badges">
			{showNew && <SettingsStatusBadge kind="new" data-flx="user.settings-status-badge.new" />}
			{showExperimental && (
				<SettingsStatusBadge kind="experimental" data-flx="user.settings-status-badge.experimental" />
			)}
		</span>
	);
}
