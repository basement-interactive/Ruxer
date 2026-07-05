// SPDX-License-Identifier: AGPL-3.0-or-later

import {showChannelErrorModal} from '@app/features/channel/components/alerts/ChannelErrorModalUtils';
import {ChannelHeaderIcon} from '@app/features/channel/components/channel_header_components/ChannelHeaderIcon';
import type {Channel} from '@app/features/channel/models/Channel';
import {isSystemDmChannel} from '@app/features/channel/utils/ChannelUtils';
import {
	START_VIDEO_CALL_DESCRIPTOR,
	START_VOICE_CALL_DESCRIPTOR,
	TURN_OFF_CAMERA_DESCRIPTOR,
} from '@app/features/i18n/utils/CommonMessageDescriptors';
import Users from '@app/features/user/state/Users';
import * as CallCommands from '@app/features/voice/commands/CallCommands';
import MediaEngine from '@app/features/voice/engine/MediaEngineFacade';
import CallState from '@app/features/voice/state/CallState';
import LocalVoiceState from '@app/features/voice/state/LocalVoiceState';
import VoiceSettings from '@app/features/voice/state/VoiceSettings';
import * as CallUtils from '@app/features/voice/utils/CallUtils';
import {VOICE_TURN_ON_CAMERA_DESCRIPTOR} from '@app/features/voice/utils/VoiceMessageDescriptors';
import {ChannelTypes} from '@fluxer/constants/src/ChannelConstants';
import {msg, plural} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {PhoneIcon, VideoCameraIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback} from 'react';

const SYSTEM_DMS_CANNOT_HOST_VOICE_CALLS_DESCRIPTOR = msg({
	message: 'System DMs cannot host voice calls.',
	comment:
		'Tooltip body on the disabled voice call button in a system DM. System DMs are official Fluxer system accounts.',
});
const VOICE_CALL_UNAVAILABLE_DESCRIPTOR = msg({
	message: 'Voice call unavailable',
	comment: 'Title of the modal shown when the voice call action is blocked.',
});
const CLAIM_YOUR_ACCOUNT_TO_START_OR_JOIN_1_DESCRIPTOR = msg({
	message: 'Claim your account to start or join 1:1 calls.',
	comment:
		'Tooltip body on the disabled voice call button for unclaimed (guest) accounts. Encourages account creation.',
});
const SYSTEM_DMS_CANNOT_HOST_VOICE_CALLS_2_DESCRIPTOR = msg({
	message: 'System DMs cannot host voice calls',
	comment: 'Short tooltip on the disabled voice call button in a system DM (variant without trailing period).',
});
const LEAVE_VOICE_CALL_DESCRIPTOR = msg({
	message: 'Leave voice call',
	comment: 'Tooltip on the channel header voice call button when the current user is already in the DM voice call.',
});
const JOIN_VOICE_CALL_DESCRIPTOR = msg({
	message: 'Join voice call',
	comment: 'Tooltip on the channel header voice call button when an ongoing voice call exists that the user can join.',
});
const CLAIM_YOUR_ACCOUNT_TO_CALL_DESCRIPTOR = msg({
	message: 'Claim your account to call',
	comment: 'Tooltip on the channel header voice call button for guest accounts. Prompts account claim.',
});
const SYSTEM_DMS_CANNOT_HOST_VIDEO_CALLS_DESCRIPTOR = msg({
	message: 'System DMs cannot host video calls.',
	comment: 'Tooltip body on the disabled video call button in a system DM.',
});
const VIDEO_CALL_UNAVAILABLE_DESCRIPTOR = msg({
	message: 'Video call unavailable',
	comment: 'Title of the modal shown when the video call action is blocked.',
});
const SYSTEM_DMS_CANNOT_HOST_VIDEO_CALLS_2_DESCRIPTOR = msg({
	message: 'System DMs cannot host video calls',
	comment: 'Short tooltip on the disabled video call button in a system DM (variant without trailing period).',
});
const JOIN_VIDEO_CALL_DESCRIPTOR = msg({
	message: 'Join video call',
	comment:
		'Tooltip on the channel header video call button when an ongoing call exists that the user can join with video.',
});
const VoiceCallButton = observer(({channel}: {channel: Channel}) => {
	const {i18n} = useLingui();
	const call = CallState.getCall(channel.id);
	const isConnected = MediaEngine.connected;
	const connectedChannelId = MediaEngine.channelId;
	const isInCall = isConnected && connectedChannelId === channel.id;
	const hasActiveCall = CallState.hasActiveCall(channel.id);
	const participants = call ? CallState.getParticipants(channel.id) : [];
	const participantCount = participants.length;
	const currentUser = Users.getCurrentUser();
	const isUnclaimed = !(currentUser?.isClaimed() ?? false);
	const is1to1 = channel.type === ChannelTypes.DM;
	const systemDmBlock = isSystemDmChannel(channel);
	const unclaimedBlock = isUnclaimed && is1to1;
	const blocked = systemDmBlock || unclaimedBlock;
	const handleClick = useCallback(
		async (event: React.MouseEvent) => {
			if (systemDmBlock) {
				showChannelErrorModal({
					title: i18n._(VOICE_CALL_UNAVAILABLE_DESCRIPTOR),
					message: i18n._(SYSTEM_DMS_CANNOT_HOST_VOICE_CALLS_DESCRIPTOR),
					dataFlx: 'channel.call-buttons.voice-call.system-dm-blocked.generic-error-modal',
				});
				return;
			}
			if (unclaimedBlock) {
				showChannelErrorModal({
					title: i18n._(CLAIM_YOUR_ACCOUNT_TO_CALL_DESCRIPTOR),
					message: i18n._(CLAIM_YOUR_ACCOUNT_TO_START_OR_JOIN_1_DESCRIPTOR),
					dataFlx: 'channel.call-buttons.voice-call.unclaimed-account-blocked.generic-error-modal',
				});
				return;
			}
			if (isInCall) {
				void CallCommands.leaveCall(channel.id);
			} else if (hasActiveCall) {
				CallCommands.joinCall(channel.id);
			} else {
				await CallUtils.requestStartCall(
					i18n,
					channel.id,
					CallUtils.getCallStartRequestOptions(event, {kind: 'voice'}),
				);
			}
		},
		[channel.id, hasActiveCall, i18n, isInCall, systemDmBlock, unclaimedBlock],
	);
	let label: string;
	if (systemDmBlock) {
		label = i18n._(SYSTEM_DMS_CANNOT_HOST_VOICE_CALLS_2_DESCRIPTOR);
	} else if (participantCount > 0 && hasActiveCall) {
		if (isInCall) {
			label = i18n._(LEAVE_VOICE_CALL_DESCRIPTOR);
		} else {
			label = i18n._(JOIN_VOICE_CALL_DESCRIPTOR);
		}
	} else {
		label = blocked
			? i18n._(CLAIM_YOUR_ACCOUNT_TO_CALL_DESCRIPTOR)
			: isInCall
				? i18n._(LEAVE_VOICE_CALL_DESCRIPTOR)
				: hasActiveCall
					? i18n._(JOIN_VOICE_CALL_DESCRIPTOR)
					: i18n._(START_VOICE_CALL_DESCRIPTOR);
	}
	return (
		<ChannelHeaderIcon
			icon={PhoneIcon}
			label={label}
			isSelected={isInCall}
			onClick={handleClick}
			disabled={blocked}
			aria-pressed={isInCall}
			keybindAction="voice_start_dm_call"
			data-flx="channel.channel-header-components.call-buttons.voice-call-button.channel-header-icon.click"
		/>
	);
});
const VideoCallButton = observer(({channel}: {channel: Channel}) => {
	const {i18n} = useLingui();
	const call = CallState.getCall(channel.id);
	const isConnected = MediaEngine.connected;
	const connectedChannelId = MediaEngine.channelId;
	const isInCall = isConnected && connectedChannelId === channel.id;
	const hasActiveCall = CallState.hasActiveCall(channel.id);
	const participants = call ? CallState.getParticipants(channel.id) : [];
	const participantCount = participants.length;
	const currentUser = Users.getCurrentUser();
	const isUnclaimed = !(currentUser?.isClaimed() ?? false);
	const is1to1 = channel.type === ChannelTypes.DM;
	const systemDmBlock = isSystemDmChannel(channel);
	const unclaimedBlock = isUnclaimed && is1to1;
	const blocked = systemDmBlock || unclaimedBlock;
	const selfVideo = isInCall && LocalVoiceState.getSelfVideo();
	const handleClick = useCallback(
		async (event: React.MouseEvent) => {
			if (systemDmBlock) {
				showChannelErrorModal({
					title: i18n._(VIDEO_CALL_UNAVAILABLE_DESCRIPTOR),
					message: i18n._(SYSTEM_DMS_CANNOT_HOST_VIDEO_CALLS_DESCRIPTOR),
					dataFlx: 'channel.call-buttons.video-call.system-dm-blocked.generic-error-modal',
				});
				return;
			}
			if (unclaimedBlock) {
				showChannelErrorModal({
					title: i18n._(CLAIM_YOUR_ACCOUNT_TO_CALL_DESCRIPTOR),
					message: i18n._(CLAIM_YOUR_ACCOUNT_TO_START_OR_JOIN_1_DESCRIPTOR),
					dataFlx: 'channel.call-buttons.video-call.unclaimed-account-blocked.generic-error-modal',
				});
				return;
			}
			if (isInCall) {
				const enable = !LocalVoiceState.getSelfVideo();
				await MediaEngine.setCameraEnabled(enable, {
					deviceId: VoiceSettings.getVideoDeviceId(),
				});
			} else if (hasActiveCall) {
				CallCommands.joinCall(channel.id);
			} else {
				await CallUtils.requestStartCall(
					i18n,
					channel.id,
					CallUtils.getCallStartRequestOptions(event, {kind: 'video'}),
				);
			}
		},
		[channel.id, hasActiveCall, i18n, isInCall, systemDmBlock, unclaimedBlock],
	);
	let label: string;
	if (systemDmBlock) {
		label = i18n._(SYSTEM_DMS_CANNOT_HOST_VIDEO_CALLS_2_DESCRIPTOR);
	} else if (isInCall) {
		label = selfVideo ? i18n._(TURN_OFF_CAMERA_DESCRIPTOR) : i18n._(VOICE_TURN_ON_CAMERA_DESCRIPTOR);
	} else if (participantCount > 0 && hasActiveCall) {
		label = plural(
			{count: participantCount},
			{
				one: 'Join video call (# participant)',
				other: 'Join video call (# participants)',
			},
		);
	} else {
		label = blocked
			? i18n._(CLAIM_YOUR_ACCOUNT_TO_CALL_DESCRIPTOR)
			: hasActiveCall
				? i18n._(JOIN_VIDEO_CALL_DESCRIPTOR)
				: i18n._(START_VIDEO_CALL_DESCRIPTOR);
	}
	return (
		<ChannelHeaderIcon
			icon={VideoCameraIcon}
			label={label}
			isSelected={selfVideo}
			onClick={handleClick}
			disabled={blocked}
			aria-pressed={selfVideo}
			data-flx="channel.channel-header-components.call-buttons.video-call-button.channel-header-icon.click"
		/>
	);
});
export const CallButtons = {
	VoiceCallButton,
	VideoCallButton,
};
