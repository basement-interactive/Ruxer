// SPDX-License-Identifier: AGPL-3.0-or-later

import * as Modal from '@app/features/app/components/dialogs/Modal';
import {Button} from '@app/features/ui/button/Button';
import {
	useVoiceConnectionConfirmModalLogic,
	type VoiceConnectionConfirmModalProps,
} from '@app/features/voice/utils/VoiceConnectionConfirmModalUtils';
import {msg, plural} from '@lingui/core/macro';
import {Trans, useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';

const VOICE_CONNECTION_CONFIRMATION_DESCRIPTOR = msg({
	message: 'Voice connection confirmation',
	comment:
		'Aria label / title of the voice connection confirmation modal shown before switching the active voice connection.',
});
export const VoiceConnectionConfirmModal: React.FC<VoiceConnectionConfirmModalProps> = observer(
	({
		guildId,
		channelId,
		allowJustJoin = true,
		connectionLimit,
		existingConnectionsCount: providedExistingConnectionsCount,
		onSwitchDevice,
		onJustJoin,
		onCancel,
	}) => {
		const {i18n} = useLingui();
		const {
			existingConnectionsCount: liveExistingConnectionsCount,
			handleSwitchDevice,
			handleJustJoin,
			handleCancel,
		} = useVoiceConnectionConfirmModalLogic({
			guildId,
			channelId,
			onSwitchDevice,
			onJustJoin,
			onCancel,
		});
		const existingConnectionsCount = providedExistingConnectionsCount ?? liveExistingConnectionsCount;
		const limit = connectionLimit ?? existingConnectionsCount;
		const content = allowJustJoin
			? plural(
					{count: existingConnectionsCount},
					{
						one: "You're already connected to this voice channel from # other device. What would you like to do?",
						other: "You're already connected to this voice channel from # other devices. What would you like to do?",
					},
				)
			: plural(
					{count: limit},
					{
						one: "You're already using the one allowed connection for this voice channel. Switch to this device or cancel.",
						other:
							"You're already using all # allowed connections for this voice channel. Switch to this device or cancel.",
					},
				);
		return (
			<Modal.Root size="small" centered data-flx="voice.voice-connection-confirm-modal.modal-root">
				<Modal.Header
					title={i18n._(VOICE_CONNECTION_CONFIRMATION_DESCRIPTOR)}
					data-flx="voice.voice-connection-confirm-modal.modal-header"
				/>
				<Modal.Content data-flx="voice.voice-connection-confirm-modal.modal-content">{content}</Modal.Content>
				<Modal.Footer stretchButtons data-flx="voice.voice-connection-confirm-modal.modal-footer">
					<Button
						variant="primary"
						onClick={handleSwitchDevice}
						data-flx="voice.voice-connection-confirm-modal.button.switch-device"
					>
						<Trans>Switch to this device</Trans>
					</Button>
					{allowJustJoin && (
						<Button
							variant="secondary"
							onClick={handleJustJoin}
							data-flx="voice.voice-connection-confirm-modal.button.just-join"
						>
							<Trans>Just join (keep other connections)</Trans>
						</Button>
					)}
					<Button
						variant="secondary"
						onClick={handleCancel}
						data-flx="voice.voice-connection-confirm-modal.button.cancel"
					>
						<Trans>Do nothing, I don't want to join</Trans>
					</Button>
				</Modal.Footer>
			</Modal.Root>
		);
	},
);
