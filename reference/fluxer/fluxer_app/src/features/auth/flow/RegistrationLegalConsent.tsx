// SPDX-License-Identifier: AGPL-3.0-or-later

import {Routes} from '@app/app/Routes';
import {ExternalLink} from '@app/features/app/components/shared/ExternalLink';
import RuntimeConfig from '@app/features/app/state/RuntimeConfig';
import styles from '@app/features/auth/flow/AuthPageStyles.module.css';
import type {LegalConsentRequirement} from '@app/features/auth/flow/SubmitTooltip';
import {Checkbox} from '@app/features/ui/checkbox/Checkbox';
import {Trans} from '@lingui/react/macro';

export interface RegistrationLegalConsentConfig {
	termsUrl: string | null;
	privacyUrl: string | null;
	requirement: LegalConsentRequirement | null;
}

export function getRegistrationLegalConsentConfig(showLegalConsent = true): RegistrationLegalConsentConfig {
	const termsUrl = RuntimeConfig.termsUrl ?? (!RuntimeConfig.isSelfHosted() ? Routes.terms() : null);
	const privacyUrl = RuntimeConfig.privacyUrl ?? (!RuntimeConfig.isSelfHosted() ? Routes.privacy() : null);
	if (!showLegalConsent || (!termsUrl && !privacyUrl)) {
		return {
			termsUrl,
			privacyUrl,
			requirement: null,
		};
	}
	return {
		termsUrl,
		privacyUrl,
		requirement: termsUrl && privacyUrl ? 'terms_and_privacy' : termsUrl ? 'terms' : 'privacy',
	};
}

interface RegistrationLegalConsentProps {
	checked: boolean;
	config: RegistrationLegalConsentConfig;
	onChange: (checked: boolean) => void;
}

export function RegistrationLegalConsent({checked, config, onChange}: RegistrationLegalConsentProps) {
	if (!config.requirement) return null;
	return (
		<div className={styles.consentRow} data-flx="auth.flow.registration-legal-consent.consent-row">
			<Checkbox
				checked={checked}
				onChange={onChange}
				data-flx="auth.flow.registration-legal-consent.checkbox.consent-change"
			>
				<span className={styles.consentLabel} data-flx="auth.flow.registration-legal-consent.consent-label">
					{config.requirement === 'terms_and_privacy' && config.termsUrl && config.privacyUrl ? (
						<Trans>
							I agree to the{' '}
							<ExternalLink
								href={config.termsUrl}
								className={styles.policyLink}
								data-flx="auth.flow.registration-legal-consent.policy-link.terms"
							>
								Terms of service
							</ExternalLink>{' '}
							and{' '}
							<ExternalLink
								href={config.privacyUrl}
								className={styles.policyLink}
								data-flx="auth.flow.registration-legal-consent.policy-link.privacy"
							>
								Privacy policy
							</ExternalLink>
						</Trans>
					) : null}
					{config.requirement === 'terms' && config.termsUrl ? (
						<Trans>
							I agree to the{' '}
							<ExternalLink
								href={config.termsUrl}
								className={styles.policyLink}
								data-flx="auth.flow.registration-legal-consent.policy-link.terms-only"
							>
								Terms of service
							</ExternalLink>
						</Trans>
					) : null}
					{config.requirement === 'privacy' && config.privacyUrl ? (
						<Trans>
							I agree to the{' '}
							<ExternalLink
								href={config.privacyUrl}
								className={styles.policyLink}
								data-flx="auth.flow.registration-legal-consent.policy-link.privacy-only"
							>
								Privacy policy
							</ExternalLink>
						</Trans>
					) : null}
				</span>
			</Checkbox>
		</div>
	);
}
