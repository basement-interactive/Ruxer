// SPDX-License-Identifier: AGPL-3.0-or-later

import {Logger} from '@app/features/platform/utils/AppLogger';
import NativeVideoElementPool from '@app/features/voice/components/voice_participant_tile/NativeVideoElementPool';
import NativeVideoTileManager, {
	type NativeInboundVideoTrack,
} from '@app/features/voice/engine/native_voice_engine/NativeVideoTileManager';
import {useStoreVersion} from '@app/features/voice/engine/Store';
import {
	asPinnableVoiceTrackSource,
	isVoiceScreenShareSource,
	type PinnableVoiceTrackSource,
	VoiceTrackSource,
} from '@app/features/voice/engine/VoiceTrackSource';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {forwardRef, useEffect, useRef} from 'react';

const logger = new Logger('NativeParticipantVideo');

interface SelectableNativeVideoTrack {
	source: string;
	participantSid: string;
	trackSid: string;
	stream: MediaStream;
}

export function selectNativeTrackForSource<NativeVideoTrack extends SelectableNativeVideoTrack>(
	tracks: ReadonlyArray<NativeVideoTrack>,
	source: unknown,
): NativeVideoTrack | undefined {
	const requestedSource = asPinnableVoiceTrackSource(source);
	if (!requestedSource) return undefined;
	const wantScreenShare = requestedSource === VoiceTrackSource.ScreenShare;
	return tracks.find((track) =>
		wantScreenShare ? isVoiceScreenShareSource(track.source) : !isVoiceScreenShareSource(track.source),
	);
}

interface NativeParticipantVideoProps {
	participantSid: string;
	participantIdentity?: string;
	source: PinnableVoiceTrackSource;
	className?: string;
	'data-flx'?: string;
}

export function useHasNativeParticipantVideo(participantSid: string, source: unknown): boolean {
	return useNativeParticipantVideoTrack(participantSid, source) != null;
}

export function useNativeParticipantVideoTrack(
	participantSid: string,
	source: unknown,
	participantIdentity?: string,
): NativeInboundVideoTrack | undefined {
	useStoreVersion(NativeVideoTileManager);
	if (!participantSid && !participantIdentity) return undefined;
	const tracks = NativeVideoTileManager.getTracksForParticipant(participantSid, participantIdentity);
	return selectNativeTrackForSource(tracks, source);
}

const POOL_HOST_STYLE: React.CSSProperties = {display: 'contents'};

function assignForwardedVideoRef(ref: React.ForwardedRef<HTMLVideoElement>, element: HTMLVideoElement | null): void {
	if (typeof ref === 'function') {
		ref(element);
		return;
	}
	if (!ref) return;
	ref.current = element;
}

export const NativeParticipantVideo = observer(
	forwardRef<HTMLVideoElement, NativeParticipantVideoProps>(function NativeParticipantVideo(
		{participantSid, participantIdentity, source, className, 'data-flx': dataFlx},
		forwardedRef,
	) {
		const hostRef = useRef<HTMLDivElement | null>(null);
		const videoRef = useRef<HTMLVideoElement | null>(null);
		useStoreVersion(NativeVideoTileManager);
		const tracks = NativeVideoTileManager.getTracksForParticipant(participantSid, participantIdentity);
		const track = selectNativeTrackForSource(tracks, source);
		const stream = track?.stream ?? null;
		const trackSid = track?.trackSid ?? null;
		useEffect(() => {
			const host = hostRef.current;
			if (!host || !stream || !trackSid) return;
			const element = NativeVideoElementPool.acquire(trackSid);
			videoRef.current = element;
			element.className = className ?? '';
			element.setAttribute('data-flx', dataFlx ?? 'voice.native-participant-video.video');
			if (element.srcObject !== stream) {
				element.srcObject = stream;
			}
			host.appendChild(element);
			assignForwardedVideoRef(forwardedRef, element);
			const playResult = element.play();
			if (playResult && typeof playResult.catch === 'function') {
				playResult.catch((error) => {
					logger.debug('Native participant video play() rejected', {participantSid, error});
				});
			}
			return () => {
				if (element.parentNode === host) {
					host.removeChild(element);
				}
				if (!NativeVideoElementPool.isPooledFor(trackSid, element)) {
					element.srcObject = null;
				}
				if (videoRef.current === element) {
					videoRef.current = null;
				}
				assignForwardedVideoRef(forwardedRef, null);
			};
		}, [stream, trackSid, className, dataFlx, participantSid, forwardedRef]);
		if (!stream || !trackSid) return null;
		return <div ref={hostRef} style={POOL_HOST_STYLE} data-flx="voice.native-participant-video.pool-host" />;
	}),
);

export type NativeParticipantVideoComponent = React.ComponentType<NativeParticipantVideoProps>;
