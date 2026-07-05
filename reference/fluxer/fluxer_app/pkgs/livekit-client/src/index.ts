// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0
import {Mutex} from '@livekit/mutex';
import {DataPacket_Kind, DisconnectReason, Encryption_Type, SubscriptionError, TrackType} from '@livekit/protocol';
import {getLogger, LoggerNames, LogLevel, setLogExtension, setLogLevel} from './logger.ts';
import * as attributes from './room/attribute-typings.ts';
import DefaultReconnectPolicy from './room/DefaultReconnectPolicy.ts';
import LocalParticipant from './room/participant/LocalParticipant.ts';
import Participant, {
	ConnectionQuality,
	type ParticipantEventCallbacks,
	ParticipantKind,
} from './room/participant/Participant.ts';
import type {ParticipantTrackPermission} from './room/participant/ParticipantTrackPermission.ts';
import RemoteParticipant from './room/participant/RemoteParticipant.ts';
import type {ReconnectContext, ReconnectPolicy} from './room/ReconnectPolicy.ts';
import Room, {ConnectionState, type RoomEventCallbacks} from './room/Room.ts';
import type {AudioReceiverStats, AudioSenderStats, VideoReceiverStats, VideoSenderStats} from './room/stats.ts';
import CriticalTimers from './room/timers.ts';
import LocalAudioTrack from './room/track/LocalAudioTrack.ts';
import LocalTrack from './room/track/LocalTrack.ts';
import LocalTrackPublication from './room/track/LocalTrackPublication.ts';
import LocalVideoTrack from './room/track/LocalVideoTrack.ts';
import RemoteAudioTrack from './room/track/RemoteAudioTrack.ts';
import RemoteTrack from './room/track/RemoteTrack.ts';
import RemoteTrackPublication from './room/track/RemoteTrackPublication.ts';
import type {ElementInfo} from './room/track/RemoteVideoTrack.ts';
import RemoteVideoTrack from './room/track/RemoteVideoTrack.ts';
import {type PublicationEventCallbacks, TrackPublication} from './room/track/TrackPublication.ts';
import type {LiveKitReactNativeInfo, TextStreamInfo} from './room/types.ts';
import type {AudioAnalyserOptions} from './room/utils.ts';
import {
	compareVersions,
	createAudioAnalyser,
	getEmptyAudioStreamTrack,
	getEmptyVideoStreamTrack,
	isAudioCodec,
	isAudioTrack,
	isBrowserSupported,
	isLocalParticipant,
	isLocalTrack,
	isRemoteParticipant,
	isRemoteTrack,
	isVideoCodec,
	isVideoTrack,
	selectPreferredVideoCodec,
	supportsAdaptiveStream,
	supportsAudioOutputSelection,
	supportsAV1,
	supportsDynacast,
	supportsH265,
	supportsVideoCodec,
	supportsVP9,
} from './room/utils.ts';
import {getBrowser} from './utils/browserParser.ts';

export type {BaseE2EEManager} from './e2ee/E2eeManager.ts';
export * from './e2ee/index.ts';
export * from './options.ts';
export type * from './room/data-stream/incoming/StreamReader.ts';
export type * from './room/data-stream/outgoing/StreamWriter.ts';
export * from './room/errors.ts';
export * from './room/events.ts';
export {type PerformRpcParams, RpcError, type RpcInvocationData} from './room/rpc.ts';
export * from './room/token-source/TokenSource.ts';
export * from './room/token-source/types.ts';
export * from './room/track/create.ts';
export {facingModeFromDeviceLabel, facingModeFromLocalTrack} from './room/track/facingMode.ts';
export * from './room/track/options.ts';
export * from './room/track/processor/types.ts';
export * from './room/track/Track.ts';
export * from './room/track/types.ts';
export type {
	ChatMessage,
	DataPublishOptions,
	SendTextOptions,
	SimulationScenario,
	TranscriptionSegment,
} from './room/types.ts';
export * from './version.ts';
export {
	attributes,
	ConnectionQuality,
	ConnectionState,
	CriticalTimers,
	DataPacket_Kind,
	Encryption_Type,
	DefaultReconnectPolicy,
	DisconnectReason,
	LocalAudioTrack,
	LocalParticipant,
	LocalTrack,
	LocalTrackPublication,
	LocalVideoTrack,
	LogLevel,
	LoggerNames,
	Participant,
	RemoteAudioTrack,
	RemoteParticipant,
	ParticipantKind,
	RemoteTrack,
	RemoteTrackPublication,
	RemoteVideoTrack,
	Room,
	SubscriptionError,
	TrackPublication,
	TrackType,
	compareVersions,
	createAudioAnalyser,
	getBrowser,
	getEmptyAudioStreamTrack,
	getEmptyVideoStreamTrack,
	getLogger,
	isBrowserSupported,
	setLogExtension,
	setLogLevel,
	selectPreferredVideoCodec,
	supportsAV1,
	supportsAdaptiveStream,
	supportsAudioOutputSelection,
	supportsDynacast,
	supportsH265,
	supportsVideoCodec,
	supportsVP9,
	Mutex,
	isAudioCodec,
	isAudioTrack,
	isLocalTrack,
	isRemoteTrack,
	isVideoCodec,
	isVideoTrack,
	isLocalParticipant,
	isRemoteParticipant,
};
export type {
	AudioAnalyserOptions,
	ElementInfo,
	LiveKitReactNativeInfo,
	TextStreamInfo,
	ParticipantTrackPermission,
	AudioReceiverStats,
	AudioSenderStats,
	VideoReceiverStats,
	VideoSenderStats,
	ReconnectContext,
	ReconnectPolicy,
	RoomEventCallbacks,
	ParticipantEventCallbacks,
	PublicationEventCallbacks,
};
