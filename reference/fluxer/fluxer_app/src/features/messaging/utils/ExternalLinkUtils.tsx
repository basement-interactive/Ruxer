// SPDX-License-Identifier: AGPL-3.0-or-later

import {openOAuthAuthorizeModalFromUrl} from '@app/features/auth/commands/OAuthAuthorizeModalCommands';
import {ExternalLinkWarningModal} from '@app/features/messaging/components/modals/ExternalLinkWarningModal';
import TrustedDomain from '@app/features/trusted_domain/state/TrustedDomain';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {modal} from '@app/features/ui/commands/ModalCommands';
import {openExternalUrl} from '@app/features/ui/utils/NativeUtils';

export function openExternalUrlWithWarning(url: string): void {
	if (openOAuthAuthorizeModalFromUrl(url)) {
		return;
	}
	let hostname: string | null = null;
	try {
		hostname = new URL(url).hostname;
	} catch {
		hostname = null;
	}
	if (hostname && TrustedDomain.isTrustedDomain(hostname)) {
		void openExternalUrl(url);
		return;
	}
	ModalCommands.push(
		modal(() => (
			<ExternalLinkWarningModal
				url={url}
				data-flx="messaging.external-link-utils.open-external-url-with-warning.external-link-warning-modal"
			/>
		)),
	);
}
