// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';
import {
	applyScreenShareContentHint as applyScreenShareMotionContentHint,
	enforceScreenShareSenderParameters as enforceScreenShareSenderParametersForSender,
	getPreferredScreenShareCodec,
	logger,
	type SimulcastTrackInfoLike,
} from '@app/features/voice/engine/voice_screen_share_manager/shared';
import VoiceSettings from '@app/features/voice/state/VoiceSettings';
import {prepareHighFidelityScreenShareAudioTrack} from '@app/features/voice/utils/AudioPublishOptions';
import {
	resolveScreenShareContentHintForContext,
	type ScreenShareContentSource,
} from '@app/features/voice/utils/CodecCapabilityDetector';
import {
	type LocalAudioTrack,
	type LocalParticipant,
	type LocalVideoTrack,
	type Room,
	RoomEvent,
	Track,
	TrackEvent,
	type TrackPublishOptions,
	type VideoCodec,
} from 'livekit-client';

function isVideoCodecValue(value: unknown): value is VideoCodec {
	return value === 'av1' || value === 'h265' || value === 'h264' || value === 'vp9' || value === 'vp8';
}

export interface VoiceEngineV2AppScreenShareTrackPlumbingHost {
	getActiveContentSource(): ScreenShareContentSource;
}

export class VoiceEngineV2AppScreenShareTrackPlumbing {
	private readonly host: VoiceEngineV2AppScreenShareTrackPlumbingHost;
	private keepAliveElement: HTMLVideoElement | null = null;
	private keepAliveTrack: LocalVideoTrack | null = null;
	private keyFrameRequestDisposer: (() => void) | null = null;
	private senderParameterDisposer: (() => void) | null = null;

	constructor(host: VoiceEngineV2AppScreenShareTrackPlumbingHost) {
		assert.ok(host, 'track plumbing host is required');
		assert.equal(typeof host.getActiveContentSource, 'function', 'host must expose getActiveContentSource');
		this.host = host;
	}

	private getOrCreateKeepAliveElement(): HTMLVideoElement | null {
		if (typeof document === 'undefined' || !document.body) return null;
		if (this.keepAliveElement?.isConnected) return this.keepAliveElement;
		const element = document.createElement('video');
		element.autoplay = true;
		element.muted = true;
		element.playsInline = true;
		element.setAttribute('aria-hidden', 'true');
		element.setAttribute('data-flx', 'voice.screen-share-keepalive');
		Object.assign(element.style, {
			position: 'fixed',
			left: '0',
			top: '0',
			width: '2px',
			height: '2px',
			opacity: '0.001',
			visibility: 'hidden',
			pointerEvents: 'none',
			zIndex: '0',
		});
		document.body.appendChild(element);
		this.keepAliveElement = element;
		return element;
	}

	ensureKeepAliveSink(participant: LocalParticipant, preferredTrack?: LocalVideoTrack): void {
		const screenShareTrack =
			preferredTrack ??
			(participant.getTrackPublication(Track.Source.ScreenShare)?.videoTrack as LocalVideoTrack | undefined);
		if (!screenShareTrack || screenShareTrack.mediaStreamTrack.readyState === 'ended') {
			this.clearKeepAliveSink();
			return;
		}
		const element = this.getOrCreateKeepAliveElement();
		if (!element) return;
		if (this.keepAliveTrack && this.keepAliveTrack !== screenShareTrack) {
			try {
				this.keepAliveTrack.detach(element);
			} catch (error) {
				logger.debug('Failed to detach stale screen-share keepalive sink', {error});
			}
		}
		this.keepAliveTrack = screenShareTrack;
		try {
			screenShareTrack.attach(element);
			element.pause();
		} catch (error) {
			logger.warn('Failed to attach screen-share keepalive sink', {error});
		}
	}

	clearKeepAliveSink(): void {
		const element = this.keepAliveElement;
		const track = this.keepAliveTrack;
		this.keepAliveElement = null;
		this.keepAliveTrack = null;
		if (track && element) {
			try {
				track.detach(element);
			} catch (error) {
				logger.debug('Failed to detach screen-share keepalive sink', {error});
			}
		}
		if (element) {
			element.pause();
			element.srcObject = null;
			element.remove();
		}
	}

	applyContentHint(
		participant: LocalParticipant,
		contentSource: ScreenShareContentSource = this.host.getActiveContentSource(),
		preferredTrack?: LocalVideoTrack,
	): void {
		const publication = preferredTrack ? undefined : participant.getTrackPublication(Track.Source.ScreenShare);
		const track = preferredTrack ?? publication?.videoTrack;
		if (!track) {
			return;
		}
		this.applyContentHintToMediaTrack(track.mediaStreamTrack, contentSource);
	}

	applyContentHintToMediaTrack(
		mediaStreamTrack: MediaStreamTrack | undefined,
		contentSource: ScreenShareContentSource = this.host.getActiveContentSource(),
	): void {
		if (!mediaStreamTrack) return;
		const hint = resolveScreenShareContentHintForContext(
			VoiceSettings.getScreenShareContentHintOverride(),
			getPreferredScreenShareCodec(),
			contentSource,
			VoiceSettings.getStreamingMode(),
		);
		if (!hint) {
			mediaStreamTrack.contentHint = '';
			return;
		}
		applyScreenShareMotionContentHint(mediaStreamTrack, hint);
	}

	applyAudioContentHint(participant: LocalParticipant): void {
		const publication = participant.getTrackPublication(Track.Source.ScreenShareAudio);
		const track =
			publication?.audioTrack?.mediaStreamTrack ??
			(publication?.track as LocalAudioTrack | undefined)?.mediaStreamTrack;
		prepareHighFidelityScreenShareAudioTrack(track);
	}

	async enforceSenderParameters(participant: LocalParticipant, publishOptions?: TrackPublishOptions): Promise<void> {
		const publication = participant.getTrackPublication(Track.Source.ScreenShare);
		const track = publication?.videoTrack as LocalVideoTrack | undefined;
		await this.enforceTrackSenderParameters(track, publishOptions);
		this.bindSenderParameterReapply(participant, publishOptions, track);
	}

	async enforceTrackSenderParameters(
		track: LocalVideoTrack | undefined,
		publishOptions?: TrackPublishOptions,
	): Promise<void> {
		let applied = await enforceScreenShareSenderParametersForSender(track?.sender, publishOptions);
		const simulcastCodecs = (
			track as
				| (LocalVideoTrack & {
						simulcastCodecs?: Map<unknown, SimulcastTrackInfoLike>;
				  })
				| undefined
		)?.simulcastCodecs;
		if (simulcastCodecs?.size) {
			for (const [codec, simulcastTrackInfo] of simulcastCodecs) {
				const codecOverride = isVideoCodecValue(codec) ? codec : undefined;
				const backupApplied = await enforceScreenShareSenderParametersForSender(
					simulcastTrackInfo.sender,
					publishOptions,
					codecOverride,
				);
				applied = applied || backupApplied;
			}
		}
		if (!applied) {
			logger.warn('No sender found for screen share sender parameter enforcement');
		}
	}

	cleanupSenderParameterReapply(): void {
		this.senderParameterDisposer?.();
		this.senderParameterDisposer = null;
	}

	bindSenderParameterReapply(
		participant: LocalParticipant,
		publishOptions?: TrackPublishOptions,
		preferredTrack?: LocalVideoTrack,
	): void {
		this.cleanupSenderParameterReapply();
		const publication = preferredTrack ? undefined : participant.getTrackPublication(Track.Source.ScreenShare);
		const track = preferredTrack ?? (publication?.videoTrack as LocalVideoTrack | undefined);
		if (!track) return;
		const reapply = (): void => {
			void this.enforceTrackSenderParameters(track, publishOptions).catch((error) => {
				logger.warn('Failed to reapply screen share sender parameters after track restart', {error});
			});
		};
		track.on(TrackEvent.Restarted, reapply);
		this.senderParameterDisposer = () => {
			track.off(TrackEvent.Restarted, reapply);
		};
	}

	cleanupKeyFrameRequests(): void {
		this.keyFrameRequestDisposer?.();
		this.keyFrameRequestDisposer = null;
	}

	bindKeyFrameRequests(room: Room | null, participant: LocalParticipant, preferredTrack?: LocalVideoTrack): void {
		this.cleanupKeyFrameRequests();
		if (!room || VoiceSettings.getStreamingMode() !== 'screenshare') return;
		const requestKeyFrame = (): void => {
			const publication = preferredTrack ? undefined : participant.getTrackPublication(Track.Source.ScreenShare);
			const track = preferredTrack ?? (publication?.videoTrack as LocalVideoTrack | undefined);
			const sender = track?.sender as
				| (RTCRtpSender & {
						generateKeyFrame?: () => Promise<void>;
				  })
				| undefined;
			if (typeof sender?.generateKeyFrame !== 'function') return;
			void sender.generateKeyFrame().catch((error) => {
				logger.debug('Failed to generate screen-share keyframe on participant join', {error});
			});
		};
		room.on(RoomEvent.ParticipantConnected, requestKeyFrame);
		this.keyFrameRequestDisposer = () => {
			room.off(RoomEvent.ParticipantConnected, requestKeyFrame);
		};
	}
}
