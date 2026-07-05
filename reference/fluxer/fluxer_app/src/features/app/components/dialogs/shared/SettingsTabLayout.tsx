// SPDX-License-Identifier: AGPL-3.0-or-later

import {useSettingsCurrentTab} from '@app/features/app/components/dialogs/shared/SettingsCurrentTabContext';
import {SettingsHeadingLinkButton} from '@app/features/app/components/dialogs/shared/SettingsHeadingLinkButton';
import sectionStyles from '@app/features/app/components/dialogs/shared/SettingsSection.module.css';
import styles from '@app/features/app/components/dialogs/shared/SettingsTabLayout.module.css';
import {
	tabHasMultipleLinkableSections,
	type UserSettingsTabType,
} from '@app/features/user/components/settings_utils/SettingsSectionRegistry';
import {
	buildUserSettingsDeepLink,
	getUserSettingsSectionDeepLinkTarget,
} from '@app/features/user/components/settings_utils/UserSettingsDeepLinks';
import {clsx} from 'clsx';
import type React from 'react';

interface SettingsTabContainerProps {
	children: React.ReactNode;
	className?: string;
}

export const SettingsTabContainer: React.FC<SettingsTabContainerProps> = ({children, className}) => {
	return (
		<div
			className={clsx(styles.container, className)}
			data-flx="app.settings-tab-layout.settings-tab-container.container"
		>
			{children}
		</div>
	);
};

interface SettingsTabContentProps {
	children: React.ReactNode;
	className?: string;
}

export const SettingsTabContent: React.FC<SettingsTabContentProps> = ({children, className}) => {
	return (
		<div className={clsx(styles.content, className)} data-flx="app.settings-tab-layout.settings-tab-content.content">
			{children}
		</div>
	);
};

interface SettingsTabSectionProps {
	id?: string;
	tabType?: UserSettingsTabType;
	title?: React.ReactNode;
	description?: React.ReactNode;
	actions?: React.ReactNode;
	children: React.ReactNode;
	className?: string;
}

export const SettingsTabSection: React.FC<SettingsTabSectionProps> = ({
	id,
	tabType,
	title,
	description,
	actions,
	children,
	className,
}) => {
	const currentTab = useSettingsCurrentTab();
	const resolvedTabType = tabType ?? currentTab ?? undefined;
	const linkTarget = id ? getUserSettingsSectionDeepLinkTarget(id, resolvedTabType) : null;
	const linkHref =
		linkTarget && tabHasMultipleLinkableSections(linkTarget.tab)
			? buildUserSettingsDeepLink(linkTarget.tab, linkTarget.section)
			: null;
	return (
		<div
			id={id}
			className={clsx(styles.subsection, className)}
			data-flx="app.settings-tab-layout.settings-tab-section.subsection"
		>
			{(title || description || actions) && (
				<div className={sectionStyles.subsectionHeader} data-flx="app.settings-tab-layout.settings-tab-section.div">
					{(title || actions) && (
						<div
							className={sectionStyles.sectionTitleRow}
							data-flx="app.settings-tab-layout.settings-tab-section.title-row"
						>
							{title ? (
								<h4
									className={sectionStyles.subsectionTitle}
									data-flx="app.settings-tab-layout.settings-tab-section.h4"
								>
									{title}
								</h4>
							) : null}
							{linkHref ? (
								<SettingsHeadingLinkButton
									href={linkHref}
									data-flx="app.settings-tab-layout.settings-tab-section.heading-link-button"
								/>
							) : null}
							{actions ? (
								<div
									className={sectionStyles.subsectionActions}
									data-flx="app.settings-tab-layout.settings-tab-section.actions"
								>
									{actions}
								</div>
							) : null}
						</div>
					)}
					{description && (
						<p
							className={sectionStyles.subsectionDescription}
							data-flx="app.settings-tab-layout.settings-tab-section.p"
						>
							{description}
						</p>
					)}
				</div>
			)}
			<div className={sectionStyles.subsectionContent} data-flx="app.settings-tab-layout.settings-tab-section.div--2">
				{children}
			</div>
		</div>
	);
};
