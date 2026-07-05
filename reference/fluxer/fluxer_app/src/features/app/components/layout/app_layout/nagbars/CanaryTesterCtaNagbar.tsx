// SPDX-License-Identifier: AGPL-3.0-or-later

import i18nGlobal from '@app/app/I18n';
import {GenericErrorModal} from '@app/features/app/components/alerts/GenericErrorModal';
import {dismissCanaryTesterCtaNagbar} from '@app/features/app/components/layout/app_layout/CanaryTesterDismissal';
import {Nagbar} from '@app/features/app/components/layout/Nagbar';
import {NagbarButton} from '@app/features/app/components/layout/NagbarButton';
import {NagbarContent} from '@app/features/app/components/layout/NagbarContent';
import {
	CANARY_RELEASE_CHANNEL_NAME,
	CANARY_TESTERS_COMMUNITY_NAME,
} from '@app/features/app/config/I18nDisplayConstants';
import * as CanaryTesterCommands from '@app/features/canary_tester/commands/CanaryTesterCommands';
import {failureCode} from '@app/features/platform/utils/ResponseInspection';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {modal} from '@app/features/ui/commands/ModalCommands';
import * as ToastCommands from '@app/features/ui/commands/ToastCommands';
import NagbarState from '@app/features/ui/state/Nagbar';
import {APIErrorCodes} from '@fluxer/constants/src/ApiErrorCodes';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import {useState} from 'react';

const JOINED_TESTERS_COMMUNITY_DESCRIPTOR = msg({
	message: 'You joined {testersCommunityName}. Thanks for testing {canaryReleaseName}!',
	comment:
		'Toast success shown after joining the canary testers community. {testersCommunityName} is the community name and {canaryReleaseName} is the release channel name.',
});
const VERIFY_EMAIL_TITLE_DESCRIPTOR = msg({
	message: 'Verify your email first',
	comment: 'Title of the error modal shown when an unverified account tries to join the canary testers community.',
});
const VERIFY_EMAIL_MESSAGE_DESCRIPTOR = msg({
	message: 'You need to verify your email before you can join {testersCommunityName}.',
	comment: 'Body of the error modal shown when an unverified account tries to join the canary testers community.',
});
const ACCOUNT_TOO_NEW_TITLE_DESCRIPTOR = msg({
	message: 'Your account is too new',
	comment: 'Title of the error modal shown when a too-new account tries to join the canary testers community.',
});
const ACCOUNT_TOO_NEW_MESSAGE_DESCRIPTOR = msg({
	message: 'This account is too new to join {testersCommunityName} yet. Try again in a little while.',
	comment: 'Body of the error modal shown when a too-new account tries to join the canary testers community.',
});
const SUSPICIOUS_ACTIVITY_TITLE_DESCRIPTOR = msg({
	message: "We can't add you right now",
	comment:
		'Title of the error modal shown when a flagged account is blocked from joining the canary testers community.',
});
const SUSPICIOUS_ACTIVITY_MESSAGE_DESCRIPTOR = msg({
	message:
		"Your account can't join {testersCommunityName} at the moment. Contact support if you think this is a mistake.",
	comment: 'Body of the error modal shown when a flagged account is blocked from joining the canary testers community.',
});
const JOIN_FAILED_TITLE_DESCRIPTOR = msg({
	message: "Couldn't join {testersCommunityName}",
	comment: 'Title of the generic fallback error modal shown when joining the canary testers community fails.',
});
const JOIN_FAILED_MESSAGE_DESCRIPTOR = msg({
	message: 'Something went wrong. Please try again in a moment.',
	comment: 'Body of the generic fallback error modal shown when joining the canary testers community fails.',
});

function showCanaryJoinErrorModal(error: unknown, testersCommunityName: string): void {
	const code = failureCode(error);
	let title: string;
	let message: string;
	switch (code) {
		case APIErrorCodes.CANARY_TESTER_EMAIL_VERIFICATION_REQUIRED:
		case APIErrorCodes.EMAIL_VERIFICATION_REQUIRED:
			title = i18nGlobal._(VERIFY_EMAIL_TITLE_DESCRIPTOR);
			message = i18nGlobal._(VERIFY_EMAIL_MESSAGE_DESCRIPTOR, {testersCommunityName});
			break;
		case APIErrorCodes.ACCOUNT_TOO_NEW_FOR_GUILD:
			title = i18nGlobal._(ACCOUNT_TOO_NEW_TITLE_DESCRIPTOR);
			message = i18nGlobal._(ACCOUNT_TOO_NEW_MESSAGE_DESCRIPTOR, {testersCommunityName});
			break;
		case APIErrorCodes.ACCOUNT_SUSPICIOUS_ACTIVITY:
			title = i18nGlobal._(SUSPICIOUS_ACTIVITY_TITLE_DESCRIPTOR);
			message = i18nGlobal._(SUSPICIOUS_ACTIVITY_MESSAGE_DESCRIPTOR, {testersCommunityName});
			break;
		default:
			title = i18nGlobal._(JOIN_FAILED_TITLE_DESCRIPTOR, {testersCommunityName});
			message = i18nGlobal._(JOIN_FAILED_MESSAGE_DESCRIPTOR);
			break;
	}
	ModalCommands.push(
		modal(() => (
			<GenericErrorModal
				title={title}
				message={message}
				data-flx="app.app-layout.nagbars.canary-tester-cta-nagbar.join.generic-error-modal"
			/>
		)),
	);
}
const JOIN_TESTERS_COMMUNITY_DESCRIPTOR = msg({
	message: 'Join {testersCommunityName}',
	comment: 'CTA button label for joining the canary testers community. testersCommunityName is a community name.',
});
const CANARY_TESTER_CTA_MESSAGE_DESCRIPTOR = msg({
	message:
		"You're on {canaryReleaseName}. Join {testersCommunityName} to submit bug reports and feedback about upcoming builds.",
	comment:
		'Nagbar body inviting canary release users to join the testers community. {canaryReleaseName} is the release channel name and {testersCommunityName} is the community name.',
});
export const CanaryTesterCtaNagbar = observer(({isMobile}: {isMobile: boolean}) => {
	const {i18n} = useLingui();
	const canaryReleaseChannelName = CANARY_RELEASE_CHANNEL_NAME;
	const canaryTestersCommunityName = CANARY_TESTERS_COMMUNITY_NAME;
	const [isSubmitting, setIsSubmitting] = useState(false);
	const handleDismiss = () => {
		dismissCanaryTesterCtaNagbar();
		NagbarState.bumpCanaryTesterCtaDismissed();
	};
	const handleJoin = async () => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		try {
			await CanaryTesterCommands.joinCanaryTesters();
			ToastCommands.createToast({
				type: 'success',
				children: i18n._(JOINED_TESTERS_COMMUNITY_DESCRIPTOR, {
					testersCommunityName: canaryTestersCommunityName,
					canaryReleaseName: canaryReleaseChannelName,
				}),
			});
			handleDismiss();
		} catch (error) {
			showCanaryJoinErrorModal(error, canaryTestersCommunityName);
		} finally {
			setIsSubmitting(false);
		}
	};
	return (
		<Nagbar
			isMobile={isMobile}
			backgroundColor="#fbbf24"
			textColor="#1f2937"
			onDismiss={handleDismiss}
			dismissible={true}
			data-flx="app.app-layout.nagbars.canary-tester-cta-nagbar.nagbar"
		>
			<NagbarContent
				isMobile={isMobile}
				onDismiss={handleDismiss}
				message={i18n._(CANARY_TESTER_CTA_MESSAGE_DESCRIPTOR, {
					canaryReleaseName: canaryReleaseChannelName,
					testersCommunityName: canaryTestersCommunityName,
				})}
				actions={
					<NagbarButton
						isMobile={isMobile}
						onClick={handleJoin}
						submitting={isSubmitting}
						disabled={isSubmitting}
						data-flx="app.app-layout.nagbars.canary-tester-cta-nagbar.nagbar-button.join"
					>
						{i18n._(JOIN_TESTERS_COMMUNITY_DESCRIPTOR, {testersCommunityName: canaryTestersCommunityName})}
					</NagbarButton>
				}
				data-flx="app.app-layout.nagbars.canary-tester-cta-nagbar.nagbar-content"
			/>
		</Nagbar>
	);
});
