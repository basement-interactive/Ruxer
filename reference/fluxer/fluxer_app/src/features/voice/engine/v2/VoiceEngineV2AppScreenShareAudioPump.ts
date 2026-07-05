// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';
import {getEffectiveAudioState} from '@app/features/voice/engine/VoiceEffectiveAudioState';
import {requireVoiceEngineV2AppNativeBridge} from '@app/features/voice/engine/v2/VoiceEngineV2AppNativeBridge';
import type {VoiceEngineV2AppScreenShareExecutionAdapter} from '@app/features/voice/engine/v2/VoiceEngineV2AppScreenShareExecutionAdapter';
import type {NativeScreenShareOptions} from '@app/features/voice/engine/voice_screen_share_manager/DisplayMediaCapture';
import {
	type NativeEngineAudioTrackEndMessage,
	type NativeEngineAudioTrackFrame,
	startNativeEngineAudioTrackFramePump,
} from '@app/features/voice/engine/voice_screen_share_manager/NativeEngineAudioTrackPump';
import {logger} from '@app/features/voice/engine/voice_screen_share_manager/shared';
import {
	type NativeAudioFramePump,
	type NativeAudioFramePumpSource,
	startLinuxNativeAudioFramePump,
	startNativeAudioFramePump,
} from '@app/features/voice/utils/NativeAudioCaptureBridge';
import {
	MAX_NATIVE_AUDIO_CHANNELS,
	MAX_NATIVE_AUDIO_FRAME_SECONDS,
	MAX_NATIVE_AUDIO_SAMPLE_RATE,
} from '@app/features/voice/utils/native_audio_capture_bridge/shared';
import type {VoiceEngineV2BridgeApi} from '@fluxer/voice_engine_v2/bridge';

const MAX_SCREEN_SHARE_AUDIO_PUMP_FLOAT_SAMPLES =
	MAX_NATIVE_AUDIO_SAMPLE_RATE * MAX_NATIVE_AUDIO_CHANNELS * MAX_NATIVE_AUDIO_FRAME_SECONDS;

export const AUDIO_PUSH_QUEUE_FRAMES_MAX = 32;
export const AUDIO_PUSH_QUEUE_DROP_LOG_INTERVAL = 50;

interface PendingAudioPushWork {
	run: () => Promise<void>;
	drop: () => void;
}

export class BoundedAudioPushQueue {
	private readonly pending: Array<PendingAudioPushWork | null>;
	private pendingHead = 0;
	private pendingTail = 0;
	private pendingCount = 0;
	private draining = false;
	private droppedFrameCount = 0;
	private readonly onError: (error: unknown) => void;
	private readonly onDrop: (droppedFrameCount: number) => void;

	constructor(onError: (error: unknown) => void, onDrop: (droppedFrameCount: number) => void) {
		assert.ok(AUDIO_PUSH_QUEUE_FRAMES_MAX > 0, 'audio push queue capacity must be positive');
		assert.equal(typeof onError, 'function');
		assert.equal(typeof onDrop, 'function');
		this.pending = new Array(AUDIO_PUSH_QUEUE_FRAMES_MAX).fill(null);
		this.onError = onError;
		this.onDrop = onDrop;
	}

	get droppedFrames(): number {
		return this.droppedFrameCount;
	}

	get pendingFrames(): number {
		return this.pendingCount;
	}

	enqueue(work: () => Promise<void>, drop: () => void = () => undefined): void {
		assert.equal(typeof work, 'function');
		assert.equal(typeof drop, 'function');
		if (this.pendingCount >= AUDIO_PUSH_QUEUE_FRAMES_MAX) {
			const dropped = this.pending[this.pendingHead];
			this.pending[this.pendingHead] = null;
			this.pendingHead = (this.pendingHead + 1) % AUDIO_PUSH_QUEUE_FRAMES_MAX;
			this.pendingCount -= 1;
			if (dropped) {
				try {
					dropped.drop();
				} catch (error) {
					this.onError(error);
				}
			}
			this.droppedFrameCount += 1;
			this.onDrop(this.droppedFrameCount);
		}
		this.pending[this.pendingTail] = {run: work, drop};
		this.pendingTail = (this.pendingTail + 1) % AUDIO_PUSH_QUEUE_FRAMES_MAX;
		this.pendingCount += 1;
		assert.ok(this.pendingCount <= AUDIO_PUSH_QUEUE_FRAMES_MAX, 'audio push queue exceeded its cap');
		void this.drain();
	}

	private async drain(): Promise<void> {
		if (this.draining) return;
		this.draining = true;
		while (this.pendingCount > 0) {
			const work = this.pending[this.pendingHead];
			this.pending[this.pendingHead] = null;
			this.pendingHead = (this.pendingHead + 1) % AUDIO_PUSH_QUEUE_FRAMES_MAX;
			this.pendingCount -= 1;
			if (!work) continue;
			try {
				await work.run();
			} catch (error) {
				this.onError(error);
			}
		}
		assert.ok(this.pendingCount >= 0, 'audio push queue count underflowed');
		assert.ok(this.pendingCount <= AUDIO_PUSH_QUEUE_FRAMES_MAX, 'audio push queue count exceeded cap');
		this.draining = false;
	}
}

export interface ScreenShareAudioPumpDiagnostics {
	active: boolean;
	captureId: string | null;
	sampleRate: number | null;
	channels: number | null;
	usesNativeSink: boolean;
	publishStrategy: 'eager' | 'lazy' | 'none';
	publishedFormatKey: string | null;
	eagerPublish: 'succeeded' | 'failed' | 'skipped' | null;
	eagerPublishError: string | null;
	droppedPushFrames: number;
	pendingPushFrames: number;
}

function createInitialScreenShareAudioPumpDiagnostics(): ScreenShareAudioPumpDiagnostics {
	return {
		active: false,
		captureId: null,
		sampleRate: null,
		channels: null,
		usesNativeSink: false,
		publishStrategy: 'none',
		publishedFormatKey: null,
		eagerPublish: null,
		eagerPublishError: null,
		droppedPushFrames: 0,
		pendingPushFrames: 0,
	};
}

let screenShareAudioPumpDiagnostics: ScreenShareAudioPumpDiagnostics = createInitialScreenShareAudioPumpDiagnostics();
let activeScreenShareAudioPushQueue: BoundedAudioPushQueue | null = null;

export function getScreenShareAudioPumpDiagnostics(): ScreenShareAudioPumpDiagnostics {
	const queue = activeScreenShareAudioPushQueue;
	return {
		...screenShareAudioPumpDiagnostics,
		droppedPushFrames: queue?.droppedFrames ?? screenShareAudioPumpDiagnostics.droppedPushFrames,
		pendingPushFrames: queue?.pendingFrames ?? 0,
	};
}

interface AudioPumpFrameContext {
	readonly engine: VoiceEngineV2BridgeApi;
	readonly sourceKind: string;
	readonly sourceId: string;
	getActivePump: () => NativeAudioFramePump | null;
	getPublishedFormatKey: () => string | null;
	setPublishedFormatKey: (key: string) => void;
	enqueuePush: (work: () => Promise<void>, drop?: () => void) => void;
	scheduleStop: (reason: string, context?: Record<string, unknown>) => void;
}

function isValidFloatFrame(frame: NativeEngineAudioTrackFrame): boolean {
	return (
		Number.isSafeInteger(frame.sampleRate) &&
		frame.sampleRate > 0 &&
		frame.sampleRate <= MAX_NATIVE_AUDIO_SAMPLE_RATE &&
		Number.isSafeInteger(frame.channels) &&
		frame.channels > 0 &&
		frame.channels <= MAX_NATIVE_AUDIO_CHANNELS &&
		frame.samples.length > 0 &&
		frame.samples.length <= MAX_SCREEN_SHARE_AUDIO_PUMP_FLOAT_SAMPLES &&
		frame.samples.length % frame.channels === 0
	);
}

interface AudioPumpStartInput {
	audioTrack?: NativeScreenShareOptions['audioTrack'];
	nativeAudioFramePump?: NativeAudioFramePumpSource;
	linuxRule?: NativeScreenShareOptions['nativeAudioLinuxRule'];
	sourceKind: string;
	sourceId: string;
}

export class VoiceEngineV2AppScreenShareAudioPump {
	private readonly adapter: VoiceEngineV2AppScreenShareExecutionAdapter;

	constructor(adapter: VoiceEngineV2AppScreenShareExecutionAdapter) {
		this.adapter = adapter;
	}

	async stopAudio(stopLocalTrack = true, unpublishRemote = true): Promise<void> {
		assert.equal(typeof stopLocalTrack, 'boolean');
		assert.equal(typeof unpublishRemote, 'boolean');
		const pump = this.adapter.nativeEngineScreenShareAudioPump;
		this.adapter.nativeEngineScreenShareAudioPump = null;
		assert.equal(this.adapter.nativeEngineScreenShareAudioPump, null, 'audioPump must be cleared');
		screenShareAudioPumpDiagnostics = {...screenShareAudioPumpDiagnostics, active: false};
		activeScreenShareAudioPushQueue = null;
		if (pump) {
			await pump.cleanup(stopLocalTrack).catch((error) => {
				logger.warn('Failed to stop native-engine screen-share audio pump', {
					captureId: pump.captureId,
					error,
				});
			});
		}
		if (!unpublishRemote) return;
		try {
			await requireVoiceEngineV2AppNativeBridge('unpublish native screen-share audio').unpublishScreenAudio();
		} catch (error) {
			logger.warn('Failed to unpublish native-engine screen-share audio', {error});
		}
	}

	private async reassertMicMute(engine: VoiceEngineV2BridgeApi, reason: string): Promise<void> {
		if (!getEffectiveAudioState().effectiveMute) return;
		const result = await engine.setMicEnabled(false);
		if (!result.ok) {
			logger.warn('Failed to reassert native-engine microphone mute during screen-share audio publish', {
				reason,
				error: result.error,
			});
		}
	}

	private scheduleStopAfterAudioFailure(
		state: {scheduled: boolean},
		sourceKind: string,
		sourceId: string,
		reason: string,
		context: Record<string, unknown>,
	): void {
		assert.equal(typeof reason, 'string');
		assert.ok(state);
		if (state.scheduled) return;
		state.scheduled = true;
		logger.warn('Native-engine screen-share audio failed after publish; stopping screen share', {
			reason,
			sourceKind,
			sourceId,
			...context,
		});
		void this.adapter.stopNativeEngineScreenShareInternal({playSound: true}).catch((error) => {
			logger.warn('Failed to stop native-engine screen share after audio failure', {
				reason,
				sourceKind,
				sourceId,
				error,
			});
		});
	}

	private async pushFrameWork(
		ctx: AudioPumpFrameContext,
		activePump: NativeAudioFramePump,
		frame: NativeEngineAudioTrackFrame,
		formatKey: string,
	): Promise<void> {
		assert.ok(activePump);
		assert.equal(typeof formatKey, 'string');
		if (this.adapter.nativeEngineScreenShareAudioPump !== activePump) return;
		if (ctx.getPublishedFormatKey() !== formatKey) {
			await this.reassertMicMute(ctx.engine, 'before-format-republish');
			await ctx.engine.publishScreenAudio({sampleRate: frame.sampleRate, numChannels: frame.channels});
			await this.reassertMicMute(ctx.engine, 'after-format-republish');
			ctx.setPublishedFormatKey(formatKey);
			screenShareAudioPumpDiagnostics.publishStrategy = 'lazy';
			screenShareAudioPumpDiagnostics.publishedFormatKey = formatKey;
		}
		const accepted = await ctx.engine.pushScreenAudioFloat({
			sampleRate: frame.sampleRate,
			numChannels: frame.channels,
			samples: frame.samples,
		});
		if (this.adapter.nativeEngineScreenShareAudioPump !== activePump) return;
		if (accepted) return;
		logger.warn('Native-engine screen-share audio frame was rejected', {
			captureId: activePump.captureId,
			sampleRate: frame.sampleRate,
			channels: frame.channels,
		});
		ctx.scheduleStop('float-frame-rejected', {
			captureId: activePump.captureId,
			sampleRate: frame.sampleRate,
			channels: frame.channels,
		});
	}

	private makeFrameHandler(ctx: AudioPumpFrameContext): (frame: NativeEngineAudioTrackFrame) => void {
		assert.ok(ctx);
		assert.equal(typeof ctx.getActivePump, 'function');
		return (frame) => {
			const activePump = ctx.getActivePump();
			const release = frame.release ?? (() => undefined);
			if (!activePump) {
				release();
				return;
			}
			if (!isValidFloatFrame(frame)) {
				release();
				logger.warn('Dropping invalid native-engine screen-share audio frame', {
					captureId: activePump.captureId,
					sampleRate: frame.sampleRate,
					channels: frame.channels,
					samples: frame.samples.length,
				});
				return;
			}
			const formatKey = `${frame.sampleRate}:${frame.channels}`;
			ctx.enqueuePush(async () => {
				try {
					await this.pushFrameWork(ctx, activePump, frame, formatKey);
				} finally {
					release();
				}
			}, release);
		};
	}

	private makeCaptureEndedHandler(ctx: AudioPumpFrameContext): (message: NativeEngineAudioTrackEndMessage) => void {
		assert.ok(ctx);
		assert.equal(typeof ctx.scheduleStop, 'function');
		return (message) => {
			if (this.adapter.nativeEngineScreenShareAudioPump?.captureId !== message.captureId) return;
			logger.info('Native-engine screen-share audio capture ended', {
				captureId: message.captureId,
				reason: message.reason,
				detail: message.detail,
			});
			ctx.scheduleStop('capture-ended', {
				captureId: message.captureId,
				endReason: message.reason,
				endDetail: message.detail,
			});
		};
	}

	private async startUnderlyingPump(
		input: AudioPumpStartInput,
		onFrame: (frame: NativeEngineAudioTrackFrame) => void,
		onEnded: (message: NativeEngineAudioTrackEndMessage) => void,
	): Promise<NativeAudioFramePump | null> {
		assert.ok(input);
		assert.equal(typeof onFrame, 'function');
		const linuxRule = input.linuxRule;
		const nativeAudioFramePump = input.nativeAudioFramePump;
		const audioTrack = input.audioTrack;
		if (nativeAudioFramePump) {
			return startNativeAudioFramePump(
				nativeAudioFramePump,
				(message) => {
					onFrame({
						sampleRate: message.sampleRate,
						channels: message.channels,
						samples: new Float32Array(message.samples, 0, message.samples.byteLength / Float32Array.BYTES_PER_ELEMENT),
					});
				},
				onEnded,
			);
		}
		if (linuxRule) {
			return startLinuxNativeAudioFramePump(
				linuxRule,
				(message) => {
					onFrame({
						sampleRate: message.sampleRate,
						channels: message.channels,
						samples: new Float32Array(message.samples, 0, message.samples.byteLength / Float32Array.BYTES_PER_ELEMENT),
					});
				},
				onEnded,
			);
		}
		assert.ok(audioTrack);
		return startNativeEngineAudioTrackFramePump(audioTrack, onFrame, onEnded);
	}

	async startAudio(nativeOptions: NativeScreenShareOptions): Promise<boolean> {
		assert.ok(nativeOptions);
		return this.startAudioInternal({
			audioTrack: nativeOptions.audioTrack,
			nativeAudioFramePump: nativeOptions.nativeAudioFramePump,
			linuxRule: nativeOptions.nativeAudioLinuxRule,
			sourceKind: nativeOptions.source.kind,
			sourceId: nativeOptions.source.id,
		});
	}

	async startAudioFromTrack(audioTrack: MediaStreamTrack, sourceId: string): Promise<boolean> {
		assert.ok(audioTrack);
		assert.equal(typeof sourceId, 'string');
		assert.ok(sourceId.length > 0, 'device audio sourceId must be non-empty');
		return this.startAudioInternal({audioTrack, sourceKind: 'device', sourceId});
	}

	private async startAudioInternal(input: AudioPumpStartInput): Promise<boolean> {
		assert.ok(input);
		const linuxRule = input.linuxRule;
		const nativeAudioFramePump = input.nativeAudioFramePump;
		const audioTrack = input.audioTrack;
		if (!nativeAudioFramePump && !linuxRule && !audioTrack) return false;
		await this.stopAudio();
		screenShareAudioPumpDiagnostics = createInitialScreenShareAudioPumpDiagnostics();
		const engine = requireVoiceEngineV2AppNativeBridge('publish native screen-share audio');
		const sourceKind = input.sourceKind;
		const sourceId = input.sourceId;
		const stopState = {scheduled: false};
		let pump: NativeAudioFramePump | null = null;
		let publishedFormatKey: string | null = null;
		const pushQueue = new BoundedAudioPushQueue(
			(error) => {
				logger.warn('Failed to push native-engine screen-share audio frame', {
					captureId: pump?.captureId,
					error,
				});
				ctx.scheduleStop('float-frame-push-failed', {captureId: pump?.captureId, error});
			},
			(droppedFrameCount) => {
				if (droppedFrameCount % AUDIO_PUSH_QUEUE_DROP_LOG_INTERVAL !== 1) return;
				logger.warn('Native-engine screen-share audio push queue is full; dropping oldest frame', {
					captureId: pump?.captureId,
					droppedFrameCount,
					queueFramesMax: AUDIO_PUSH_QUEUE_FRAMES_MAX,
				});
			},
		);
		activeScreenShareAudioPushQueue = pushQueue;
		const ctx: AudioPumpFrameContext = {
			engine,
			sourceKind,
			sourceId,
			getActivePump: () => pump,
			getPublishedFormatKey: () => publishedFormatKey,
			setPublishedFormatKey: (key) => {
				publishedFormatKey = key;
			},
			enqueuePush: (work, drop) => {
				pushQueue.enqueue(work, drop);
			},
			scheduleStop: (reason, context = {}) => {
				this.scheduleStopAfterAudioFailure(stopState, sourceKind, sourceId, reason, context);
			},
		};
		const nextPump = await this.startUnderlyingPump(
			input,
			this.makeFrameHandler(ctx),
			this.makeCaptureEndedHandler(ctx),
		);
		if (!nextPump) {
			activeScreenShareAudioPushQueue = null;
			logger.warn(
				'Native-engine screen-share audio pump unavailable; aborting screen share because audio was requested',
				{sourceKind, sourceId, hasLinuxRule: Boolean(linuxRule), hasAudioTrack: Boolean(audioTrack)},
			);
			throw new Error('Native-engine screen-share audio pump unavailable');
		}
		pump = nextPump;
		this.adapter.nativeEngineScreenShareAudioPump = pump;
		const usesNativeSink = Boolean(nativeAudioFramePump) || Boolean(linuxRule);
		await this.afterPumpStarted(ctx, engine, pump, usesNativeSink);
		logger.info('Native-engine screen-share audio pump started', {captureId: pump.captureId});
		return this.adapter.nativeEngineScreenShareAudioPump === pump;
	}

	private async afterPumpStarted(
		ctx: AudioPumpFrameContext,
		engine: VoiceEngineV2BridgeApi,
		pump: NativeAudioFramePump,
		usesNativeSink: boolean,
	): Promise<void> {
		assert.ok(pump);
		assert.equal(typeof usesNativeSink, 'boolean');
		screenShareAudioPumpDiagnostics = {
			...screenShareAudioPumpDiagnostics,
			active: true,
			captureId: pump.captureId,
			sampleRate: pump.sampleRate,
			channels: pump.channels,
			usesNativeSink,
		};
		const formatKnown = pump.sampleRate > 0 && pump.channels > 0;
		if (!usesNativeSink || !formatKnown) {
			screenShareAudioPumpDiagnostics.eagerPublish = 'skipped';
			return;
		}
		await this.eagerlyPublishScreenAudio(ctx, engine, pump);
	}

	private async eagerlyPublishScreenAudio(
		ctx: AudioPumpFrameContext,
		engine: VoiceEngineV2BridgeApi,
		pump: NativeAudioFramePump,
	): Promise<void> {
		assert.ok(pump.sampleRate > 0, 'eager publish requires a positive sampleRate');
		assert.ok(pump.channels > 0, 'eager publish requires a positive channel count');
		const formatKey = `${pump.sampleRate}:${pump.channels}`;
		try {
			await this.reassertMicMute(engine, 'before-eager-publish');
			await engine.publishScreenAudio({sampleRate: pump.sampleRate, numChannels: pump.channels});
			await this.reassertMicMute(engine, 'after-eager-publish');
		} catch (error) {
			screenShareAudioPumpDiagnostics.eagerPublish = 'failed';
			screenShareAudioPumpDiagnostics.eagerPublishError = error instanceof Error ? error.message : String(error);
			logger.warn('Failed to eagerly publish native-engine screen-share audio; native sink has no track to feed', {
				captureId: pump.captureId,
				sampleRate: pump.sampleRate,
				channels: pump.channels,
				error,
			});
			return;
		}
		if (this.adapter.nativeEngineScreenShareAudioPump !== pump) return;
		ctx.setPublishedFormatKey(formatKey);
		screenShareAudioPumpDiagnostics.publishStrategy = 'eager';
		screenShareAudioPumpDiagnostics.publishedFormatKey = formatKey;
		screenShareAudioPumpDiagnostics.eagerPublish = 'succeeded';
		screenShareAudioPumpDiagnostics.eagerPublishError = null;
		logger.info('Eagerly published native-engine screen-share audio track for native sink', {
			captureId: pump.captureId,
			sampleRate: pump.sampleRate,
			channels: pump.channels,
		});
	}
}
