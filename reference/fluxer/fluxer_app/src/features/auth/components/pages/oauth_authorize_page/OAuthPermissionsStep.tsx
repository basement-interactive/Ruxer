// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/auth/components/pages/OAuthAuthorizePage.module.css';
import {OAuthAuthorizeActionSection} from '@app/features/auth/components/pages/oauth_authorize_page/OAuthAuthorizeActions';
import type {AuthorizeParams} from '@app/features/auth/components/pages/oauth_authorize_page/OAuthAuthorizePageShared';
import type {BotPermissionOption} from '@app/features/permissions/utils/PermissionUtils';
import {Checkbox} from '@app/features/ui/checkbox/Checkbox';
import {Scroller} from '@app/features/ui/components/Scroller';
import {Trans} from '@lingui/react/macro';
import type React from 'react';

interface OAuthPermissionsStepProps {
	authParams: AuthorizeParams;
	botPermissionOptions: ReadonlyArray<BotPermissionOption>;
	cannotSubmit: boolean;
	clientLabel: string;
	hasPreviousStep: boolean;
	onAuthorize: () => void;
	onCancel: () => void;
	onGoBack: () => void;
	onNext: () => void;
	onTogglePermission: (permissionId: string) => void;
	permissionsAdjusted: boolean;
	redirectHostname: string | null;
	requestedPermissionKeys: ReadonlyArray<string>;
	requestsAdmin: boolean;
	selectedPermissions: ReadonlySet<string>;
	showInlineActions?: boolean;
	submitting: 'approve' | 'deny' | null;
}

export const OAuthPermissionsStep: React.FC<OAuthPermissionsStepProps> = ({
	authParams,
	botPermissionOptions,
	cannotSubmit,
	clientLabel,
	hasPreviousStep,
	onAuthorize,
	onCancel,
	onGoBack,
	onNext,
	onTogglePermission,
	permissionsAdjusted,
	redirectHostname,
	requestedPermissionKeys,
	requestsAdmin,
	selectedPermissions,
	showInlineActions = true,
	submitting,
}) => {
	return (
		<div className={styles.page} data-flx="auth.o-auth-authorize-page.page--2">
			<div className={styles.heroCard} data-flx="auth.o-auth-authorize-page.hero-card">
				<div className={styles.heroCopy} data-flx="auth.o-auth-authorize-page.hero-copy">
					<h1 className={styles.heroTitle} data-flx="auth.o-auth-authorize-page.hero-title">
						<Trans>Configure bot permissions</Trans>
					</h1>
					<p className={styles.heroDescription} data-flx="auth.o-auth-authorize-page.hero-description">
						<Trans>
							Choose what {clientLabel} can do in your community. Uncheck any permissions you don't want to grant.
						</Trans>
					</p>
				</div>
			</div>
			<div className={styles.sectionDivider} data-flx="auth.o-auth-authorize-page.section-divider--2" />
			<div
				className={styles.permissionScrollContainer}
				data-flx="auth.o-auth-authorize-page.permission-scroll-container"
			>
				<Scroller
					key="oauth-permissions-scroller"
					className={styles.permissionScroller}
					data-flx="auth.o-auth-authorize-page.permission-scroller"
				>
					<div className={styles.permissionList} data-flx="auth.o-auth-authorize-page.permission-list">
						{requestedPermissionKeys.map((perm) => {
							const option = botPermissionOptions.find((opt) => opt.id === perm);
							if (!option) return null;
							return (
								<div key={perm} className={styles.permissionRow} data-flx="auth.o-auth-authorize-page.permission-row">
									<Checkbox
										checked={selectedPermissions.has(perm)}
										onChange={() => onTogglePermission(perm)}
										size="small"
										data-flx="auth.o-auth-authorize-page.checkbox.toggle-permission"
									>
										<span className={styles.permissionLabel} data-flx="auth.o-auth-authorize-page.permission-label">
											{option.label}
										</span>
									</Checkbox>
								</div>
							);
						})}
					</div>
				</Scroller>
			</div>
			{requestsAdmin && (
				<>
					<div className={styles.sectionDivider} data-flx="auth.o-auth-authorize-page.section-divider--3" />
					<div className={styles.dangerNotice} data-flx="auth.o-auth-authorize-page.danger-notice">
						<Trans>
							This bot requests the administrator permission. Only grant it if you fully trust the developer. Ask them
							to request fewer permissions instead. Close this page if unsure.
						</Trans>
					</div>
				</>
			)}
			{permissionsAdjusted && (
				<>
					<div className={styles.sectionDivider} data-flx="auth.o-auth-authorize-page.section-divider--4" />
					<div className={styles.caution} data-flx="auth.o-auth-authorize-page.caution">
						<Trans>Removing permissions could limit the bot's features.</Trans>
					</div>
				</>
			)}
			<OAuthAuthorizeActionSection
				authParams={authParams}
				redirectHostname={redirectHostname}
				showInlineActions={showInlineActions}
				showRedirectNotice={Boolean(redirectHostname)}
				hasPreviousStep={hasPreviousStep}
				hasNextStep={false}
				authorizeDisabled={cannotSubmit}
				onAuthorize={onAuthorize}
				onBack={onGoBack}
				onCancel={onCancel}
				onNext={onNext}
				submitting={submitting}
				dataFlxPrefix="auth.o-auth-authorize-page.permissions-step"
				dividerDataFlx="auth.o-auth-authorize-page.section-divider--5"
				sectionDataFlx="auth.o-auth-authorize-page.action-section"
				redirectDataFlx="auth.o-auth-authorize-page.footer-text"
				redirectTooltipDataFlx="auth.o-auth-authorize-page.tooltip"
				redirectHostnameDataFlx="auth.o-auth-authorize-page.redirect-hostname--2"
				data-flx="auth.oauth-authorize-page.o-auth-permissions-step.o-auth-authorize-action-section"
			/>
		</div>
	);
};
