// SPDX-License-Identifier: AGPL-3.0-or-later

import {ConfirmModal} from '@app/features/app/components/dialogs/ConfirmModal';
import {LongPressable} from '@app/features/app/components/LongPressable';
import {dismissCanaryTesterCtaNagbar} from '@app/features/app/components/layout/app_layout/CanaryTesterDismissal';
import {
	CANARY_RELEASE_CHANNEL_NAME,
	CANARY_TESTERS_COMMUNITY_NAME,
} from '@app/features/app/config/I18nDisplayConstants';
import * as CanaryTesterCommands from '@app/features/canary_tester/commands/CanaryTesterCommands';
import {useCanaryTesterDmInviteVisible} from '@app/features/canary_tester/hooks/useCanaryTesterDmInvite';
import {showChannelErrorModal} from '@app/features/channel/components/alerts/ChannelErrorModalUtils';
import styles from '@app/features/channel/components/direct_message/DirectMessageList.module.css';
import {isKeyboardActivationKey} from '@app/features/input/utils/KeyboardUtils';
import {HttpError} from '@app/features/platform/types/EndpointError';
import {failureMessage} from '@app/features/platform/utils/ResponseInspection';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {modal} from '@app/features/ui/commands/ModalCommands';
import * as ToastCommands from '@app/features/ui/commands/ToastCommands';
import FocusRing from '@app/features/ui/focus_ring/FocusRing';
import NagbarState from '@app/features/ui/state/Nagbar';
import {msg} from '@lingui/core/macro';
import {Trans, useLingui} from '@lingui/react/macro';
import {FlaskIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import {useCallback} from 'react';

const JOIN_TESTERS_DESCRIPTOR = msg({
	message: 'Join {testersCommunityName}',
	comment:
		'Button or menu action label in the channel and chat canary tester dm item. Keep it concise. Preserve {testersCommunityName}; it is inserted by code.',
});
const TESTERS_IS_A_COMMUNITY_FOR_CANARY_DESCRIPTOR = msg({
	message:
		'{testersCommunityName} is a community for {canaryReleaseName} users to share bug reports and feedback that helps shape upcoming releases. Join to chat with the team and other testers.',
	comment:
		'Label in the channel and chat canary tester dm item. Preserve {testersCommunityName} and {canaryReleaseName}; they are inserted by code.',
});
const COULD_NOT_JOIN_TESTERS_PLEASE_TRY_AGAIN_DESCRIPTOR = msg({
	message: 'Could not join {testersCommunityName}. Try again later.',
	comment:
		'Description text in the channel and chat canary tester dm item. Preserve {testersCommunityName}; it is inserted by code.',
});
const COULD_NOT_JOIN_TESTERS_TITLE_DESCRIPTOR = msg({
	message: 'Could not join {testersCommunityName}',
	comment:
		'Title of the error modal shown when joining the canary testers community fails. Preserve {testersCommunityName}; it is inserted by code.',
});
const JoinConfirmModal = observer(() => {
	const {i18n} = useLingui();
	const testersCommunityName = CANARY_TESTERS_COMMUNITY_NAME;
	const canaryReleaseName = CANARY_RELEASE_CHANNEL_NAME;
	return (
		<ConfirmModal
			title={i18n._(JOIN_TESTERS_DESCRIPTOR, {testersCommunityName})}
			description={i18n._(TESTERS_IS_A_COMMUNITY_FOR_CANARY_DESCRIPTOR, {
				testersCommunityName,
				canaryReleaseName,
			})}
			primaryText={i18n._(JOIN_TESTERS_DESCRIPTOR, {testersCommunityName})}
			onPrimary={async () => {
				try {
					await CanaryTesterCommands.joinCanaryTesters();
					dismissCanaryTesterCtaNagbar();
					NagbarState.bumpCanaryTesterCtaDismissed();
					ToastCommands.createToast({
						type: 'success',
						children: (
							<Trans>
								You joined {testersCommunityName}. Thanks for testing {canaryReleaseName}!
							</Trans>
						),
					});
				} catch (error) {
					const message = error instanceof HttpError ? failureMessage(error) : undefined;
					showChannelErrorModal({
						title: i18n._(COULD_NOT_JOIN_TESTERS_TITLE_DESCRIPTOR, {testersCommunityName}),
						message:
							message ??
							i18n._(COULD_NOT_JOIN_TESTERS_PLEASE_TRY_AGAIN_DESCRIPTOR, {
								testersCommunityName,
							}),
						dataFlx: 'channel.direct-message.canary-tester-dm-item.join-confirm-modal.error.generic-error-modal',
					});
					throw error;
				}
			}}
			data-flx="channel.direct-message.canary-tester-dm-item.join-confirm-modal.confirm-modal"
		/>
	);
});

function openJoinConfirm(): void {
	ModalCommands.push(
		modal(() => (
			<JoinConfirmModal data-flx="channel.direct-message.canary-tester-dm-item.open-join-confirm.join-confirm-modal" />
		)),
	);
}

export const CanaryTesterDmItemDesktop = observer(() => {
	const visible = useCanaryTesterDmInviteVisible();
	const {i18n} = useLingui();
	const testersCommunityName = CANARY_TESTERS_COMMUNITY_NAME;
	const handleClick = useCallback(() => openJoinConfirm(), []);
	if (!visible) return null;
	return (
		<FocusRing
			offset={-2}
			data-flx="channel.direct-message.canary-tester-dm-item.canary-tester-dm-item-desktop.focus-ring"
		>
			<button
				type="button"
				className={styles.clickableItem}
				onClick={handleClick}
				aria-label={i18n._(JOIN_TESTERS_DESCRIPTOR, {testersCommunityName})}
				data-flx="channel.direct-message.canary-tester-dm-item.canary-tester-dm-item-desktop.clickable-item.button"
			>
				<div
					className={styles.clickableItemContent}
					data-flx="channel.direct-message.canary-tester-dm-item.canary-tester-dm-item-desktop.clickable-item-content"
				>
					<div
						className={styles.clickableItemIcon}
						data-flx="channel.direct-message.canary-tester-dm-item.canary-tester-dm-item-desktop.clickable-item-icon"
					>
						<FlaskIcon
							weight="fill"
							className={styles.iconSize5}
							data-flx="channel.direct-message.canary-tester-dm-item.canary-tester-dm-item-desktop.icon-size5"
						/>
					</div>
					<span
						className={styles.clickableItemText}
						data-flx="channel.direct-message.canary-tester-dm-item.canary-tester-dm-item-desktop.clickable-item-text"
					>
						{i18n._(JOIN_TESTERS_DESCRIPTOR, {testersCommunityName})}
					</span>
				</div>
			</button>
		</FocusRing>
	);
});
export const CanaryTesterDmItemMobile = observer(() => {
	const visible = useCanaryTesterDmInviteVisible();
	const {i18n} = useLingui();
	const testersCommunityName = CANARY_TESTERS_COMMUNITY_NAME;
	const handleClick = useCallback(() => openJoinConfirm(), []);
	if (!visible) return null;
	return (
		<FocusRing
			offset={-2}
			data-flx="channel.direct-message.canary-tester-dm-item.canary-tester-dm-item-mobile.focus-ring"
		>
			<LongPressable
				onClick={handleClick}
				onKeyDown={(event) => {
					if (!isKeyboardActivationKey(event.key)) return;
					event.preventDefault();
					handleClick();
				}}
				onLongPress={handleClick}
				className={styles.mobilePersonalNotesButton}
				role="button"
				tabIndex={0}
				aria-label={i18n._(JOIN_TESTERS_DESCRIPTOR, {testersCommunityName})}
				data-flx="channel.direct-message.canary-tester-dm-item.canary-tester-dm-item-mobile.mobile-personal-notes-button.click"
			>
				<div
					className={styles.mobileSpecialButtonContent}
					data-flx="channel.direct-message.canary-tester-dm-item.canary-tester-dm-item-mobile.mobile-special-button-content"
				>
					<div
						className={styles.mobileSpecialButtonIcon}
						data-flx="channel.direct-message.canary-tester-dm-item.canary-tester-dm-item-mobile.mobile-special-button-icon"
					>
						<FlaskIcon
							weight="fill"
							className={styles.iconSize5}
							data-flx="channel.direct-message.canary-tester-dm-item.canary-tester-dm-item-mobile.icon-size5"
						/>
					</div>
					<div
						className={styles.mobileSpecialButtonText}
						data-flx="channel.direct-message.canary-tester-dm-item.canary-tester-dm-item-mobile.mobile-special-button-text"
					>
						<span
							className={styles.mobileSpecialButtonLabel}
							data-flx="channel.direct-message.canary-tester-dm-item.canary-tester-dm-item-mobile.mobile-special-button-label"
						>
							{i18n._(JOIN_TESTERS_DESCRIPTOR, {testersCommunityName})}
						</span>
					</div>
				</div>
			</LongPressable>
		</FocusRing>
	);
});
