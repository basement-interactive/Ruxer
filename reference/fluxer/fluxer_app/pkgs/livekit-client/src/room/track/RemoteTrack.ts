// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0
import {EventEmitter} from 'events';
import {TrackEvent} from '../events.ts';
import {monitorFrequency} from '../stats.ts';
import type {LoggerOptions} from '../types.ts';
import {Track} from './Track.ts';
import {supportsSynchronizationSources} from './utils.ts';

export default abstract class RemoteTrack<TrackKind extends Track.Kind = Track.Kind> extends Track<TrackKind> {
	receiver: RTCRtpReceiver | undefined;

	private _monitorStarted: boolean = false;

	constructor(
		mediaTrack: MediaStreamTrack,
		sid: string,
		kind: TrackKind,
		receiver: RTCRtpReceiver,
		loggerOptions?: LoggerOptions,
	) {
		super(mediaTrack, kind, loggerOptions);

		this.sid = sid;
		this.receiver = receiver;

		EventEmitter.prototype.on.call(this, 'newListener', (event: string | symbol) => {
			if (
				event === TrackEvent.TimeSyncUpdate &&
				this._monitorStarted &&
				this.timeSyncHandle === undefined &&
				supportsSynchronizationSources()
			) {
				this.registerTimeSyncUpdate();
			}
		});
	}

	get isLocal() {
		return false;
	}

	setMuted(muted: boolean) {
		if (this.isMuted !== muted) {
			this.isMuted = muted;
			this._mediaStreamTrack.enabled = !muted;
			this.emit(muted ? TrackEvent.Muted : TrackEvent.Unmuted, this);
		}
	}

	setMediaStream(stream: MediaStream) {
		this.mediaStream = stream;
		const onRemoveTrack = (event: MediaStreamTrackEvent) => {
			if (event.track === this._mediaStreamTrack) {
				stream.removeEventListener('removetrack', onRemoveTrack);
				if (this.receiver && 'playoutDelayHint' in this.receiver) {
					this.receiver.playoutDelayHint = undefined;
				}
				this.receiver = undefined;
				this._currentBitrate = 0;
				this.emit(TrackEvent.Ended, this);
			}
		};
		stream.addEventListener('removetrack', onRemoveTrack);
	}

	start() {
		this.startMonitor();
		super.enable();
	}

	override stop() {
		this._monitorStarted = false;
		this.stopMonitor();
		super.disable();
	}

	async getRTCStatsReport(): Promise<RTCStatsReport | undefined> {
		if (!this.receiver?.getStats) {
			return;
		}
		const statsReport = await this.receiver.getStats();
		return statsReport;
	}

	setPlayoutDelay(delayInSeconds: number): void {
		if (this.receiver) {
			if ('playoutDelayHint' in this.receiver) {
				this.receiver.playoutDelayHint = delayInSeconds;
			} else {
				this.log.warn('Playout delay not supported in this browser');
			}
		} else {
			this.log.warn('Cannot set playout delay, track already ended');
		}
	}

	getPlayoutDelay(): number {
		if (this.receiver) {
			if ('playoutDelayHint' in this.receiver) {
				return this.receiver.playoutDelayHint as number;
			} else {
				this.log.warn('Playout delay not supported in this browser');
			}
		} else {
			this.log.warn('Cannot get playout delay, track already ended');
		}
		return 0;
	}

	startMonitor() {
		this._monitorStarted = true;
		if (!this.monitorInterval) {
			this.monitorInterval = setInterval(() => this.runMonitor(this.monitorReceiver), monitorFrequency);
		}
		if (supportsSynchronizationSources() && this.listenerCount(TrackEvent.TimeSyncUpdate) > 0) {
			this.registerTimeSyncUpdate();
		}
	}

	protected abstract monitorReceiver(): void;

	registerTimeSyncUpdate() {
		if (this.timeSyncHandle !== undefined) {
			return;
		}
		const loop = () => {
			this.timeSyncHandle = requestAnimationFrame(() => loop());
			const sources = this.receiver?.getSynchronizationSources()[0];
			if (sources) {
				const {timestamp, rtpTimestamp} = sources;
				if (rtpTimestamp && this.rtpTimestamp !== rtpTimestamp) {
					this.emit(TrackEvent.TimeSyncUpdate, {timestamp, rtpTimestamp});
					this.rtpTimestamp = rtpTimestamp;
				}
			}
		};
		loop();
	}
}
