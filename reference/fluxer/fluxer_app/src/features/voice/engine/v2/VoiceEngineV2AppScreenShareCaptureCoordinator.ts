// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';
import i18n from '@app/app/I18n';
import {SoundType} from '@app/features/notification/utils/SoundUtils';
import * as SoundCommands from '@app/features/ui/commands/SoundCommands';
import {getElectronAPI} from '@app/features/ui/utils/NativeUtils';
import AdaptiveScreenShareEngine from '@app/features/voice/engine/AdaptiveScreenShareEngine';
import type {NativeVoiceEngineLocalTrackPublication} from '@app/features/voice/engine/native_voice_engine/nativeVoiceEngineEventMapper';
import {
	markScreenShareCaptureActive,
	markScreenShareCaptureEnded,
} from '@app/features/voice/engine/ScreenShareCaptureDiagnostics';
import type {VoiceScreenShareSourceType} from '@app/features/voice/engine/VoiceScreenShareStateMachine';
import {
	isVoiceEngineV2AppNativeScreenShareBridgeAvailable,
	isVoiceEngineV2AppNativeScreenShareEncodingUpdateAvailable,
	requireVoiceEngineV2AppNativeBridge,
} from '@app/features/voice/engine/v2/VoiceEngineV2AppNativeBridge';
import type {VoiceEngineV2AppScreenShareSetEnabledOptions} from '@app/features/voice/engine/v2/VoiceEngineV2AppScreenShareControllerRouting';
import type {VoiceEngineV2AppScreenShareExecutionAdapter} from '@app/features/voice/engine/v2/VoiceEngineV2AppScreenShareExecutionAdapter';
import {
	guardScreenShareEntry,
	SCREEN_SHARE_SOURCE_SWITCH_UNSUPPORTED_PLATFORM_WARNING,
	SCREEN_SHARE_UNSUPPORTED_PLATFORM_WARNING,
} from '@app/features/voice/engine/v2/VoiceEngineV2AppScreenShareGuards';
import {
	getDeviceScreenSharePublishDimensions,
	isScreenShareVideoCodecValue,
	isUserCancelledOrPermissionDeniedError,
} from '@app/features/voice/engine/v2/VoiceEngineV2AppScreenShareNativePublishOptions';
import {
	abortScreenShareRestartMigration,
	announceScreenShareRestartMigration,
	commitScreenShareRestartMigration,
	type ScreenShareRestartMigrationSession,
} from '@app/features/voice/engine/v2/VoiceEngineV2AppScreenShareRestartMigration';
import {
	applyScreenShareState,
	buildScreenShareFailureTransition,
	runScreenShareActivationRitual,
} from '@app/features/voice/engine/v2/VoiceEngineV2AppScreenShareRituals';
import {
	type NativeEngineScreenCapture,
	type NativeScreenShareOptions,
	startNativeCaptureForEngine,
	stopNativeCaptureForEngine,
} from '@app/features/voice/engine/voice_screen_share_manager/DisplayMediaCapture';
import {
	ensureNativeCameraPermissionForDeviceShare,
	ensureNativeMicrophonePermissionForDeviceShare,
} from '@app/features/voice/engine/voice_screen_share_manager/NativePermissionGate';
import {
	type DeviceScreenShareCaptureOptions,
	logger,
} from '@app/features/voice/engine/voice_screen_share_manager/shared';
import ActiveScreenShareSource from '@app/features/voice/state/ActiveScreenShareSource';
import LocalVoiceState from '@app/features/voice/state/LocalVoiceState';
import VoiceSettings from '@app/features/voice/state/VoiceSettings';
import {prepareHighFidelityScreenShareAudioTrack} from '@app/features/voice/utils/AudioPublishOptions';
import {getLastNativeAudioArmFailure} from '@app/features/voice/utils/NativeAudioCaptureBridge';
import type {NativeScreenCaptureSource} from '@app/types/electron.d';
import type {VoiceEngineV2ScreenOptions} from '@fluxer/voice_engine_v2';
import {msg} from '@lingui/core/macro';
import type {Room, ScreenShareCaptureOptions, TrackPublishOptions} from 'livekit-client';

const SCREEN_SHARE_SOURCE_NO_LONGER_AVAILABLE_DESCRIPTOR = msg({
	message: 'The window or display you were sharing is no longer available, so your screen share was stopped.',
	comment: 'Body of a modal shown when a native screen share stops because the selected display or window disappeared.',
	context: 'screen-share',
});
const WINDOW_SCREEN_SHARE_SOURCE_DESCRIPTOR = msg({
	message: 'Window',
	comment: 'Fallback display name for a window screen-share source when the original window title is unavailable.',
	context: 'screen-share',
});
const SCREEN_SCREEN_SHARE_SOURCE_DESCRIPTOR = msg({
	message: 'Screen',
	comment: 'Fallback display name for a full-screen screen-share source when the original display name is unavailable.',
	context: 'screen-share',
});

interface NativeEngineScreenShareSettingsUpdateRequest {
	room: Room | null;
	options?: ScreenShareCaptureOptions;
	publishOptions?: TrackPublishOptions;
}

interface NativeEngineScreenShareEncodingState {
	width: number;
	height: number;
	frameRate: number | undefined;
	maxBitrateBps: number | undefined;
	codec: TrackPublishOptions['videoCodec'] | undefined;
}

type NativeEngineScreenShareSettingsUpdatePlan =
	| {
			action: 'noop';
	  }
	| {
			action: 'update-encoding';
			state: NativeEngineScreenShareEncodingState;
	  }
	| {
			action: 'restart';
			reason: 'codec-changed' | 'encoding-update-unavailable';
	  };

export type VoiceEngineV2AppScreenShareCaptureIdGenerator = () => string;

export interface VoiceEngineV2AppScreenShareCaptureCoordinatorOptions {
	captureIdGenerator?: VoiceEngineV2AppScreenShareCaptureIdGenerator;
}

export interface NativeEngineScreenShareCaptureDimensions {
	width: number;
	height: number;
}

export type VoiceEngineV2AppScreenShareActiveCaptureRecord =
	| {
			readonly kind: 'idle';
	  }
	| {
			readonly kind: 'restore';
			readonly options: NativeScreenShareOptions;
			readonly publishOptions: TrackPublishOptions | undefined;
	  }
	| {
			readonly kind: 'display';
			readonly captureId: string;
			readonly captureDimensions: NativeEngineScreenShareCaptureDimensions;
			readonly options: NativeScreenShareOptions;
			readonly publishOptions: TrackPublishOptions | undefined;
			readonly publishedTrackSid: string | null;
	  }
	| {
			readonly kind: 'device';
			readonly publishedTrackSid: string | null;
	  };

interface NativeEngineScreenSharePublicationSidWaiter {
	captureId: string;
	resolve: (trackSid: string) => void;
	reject: (error: Error) => void;
	timeoutId: NodeJS.Timeout;
}

interface NativeEngineScreenShareStartCaptureOptions {
	sendUpdate?: boolean;
	playSound?: boolean;
	allowDuringPending?: boolean;
}

const EMPTY_ACTIVE_CAPTURE_RECORD: VoiceEngineV2AppScreenShareActiveCaptureRecord = {kind: 'idle'};
const NATIVE_SCREEN_SHARE_PUBLICATION_SID_WAIT_MS = 5000;
const NATIVE_SCREEN_SHARE_PUBLICATION_SID_WAITERS_MAX = 8;

interface ParsedDesktopCaptureSourceId {
	kind: 'window' | 'screen';
	id: string;
	desktopCaptureSourceId: string;
}

function parseDesktopCaptureSourceId(sourceId: string): ParsedDesktopCaptureSourceId | null {
	const parsed = /^(window|screen):([^:]+):(?:0|1)$/.exec(sourceId);
	if (!parsed) return null;
	const kind = parsed[1] === 'window' ? 'window' : 'screen';
	const id = parsed[2];
	assert.ok(id.length > 0, 'desktop capture source id must include a native id');
	return {kind, id, desktopCaptureSourceId: sourceId};
}

function buildNativeOptionsFromControllerScreenPublish(options: VoiceEngineV2ScreenOptions): NativeScreenShareOptions {
	assert.ok(options.captureId.length > 0, 'captureId is required');
	const selectedSourceId = ActiveScreenShareSource.getSourceId() ?? options.captureId;
	const parsed = parseDesktopCaptureSourceId(selectedSourceId) ?? parseDesktopCaptureSourceId(options.captureId);
	const kind = parsed?.kind ?? 'screen';
	const source: NativeScreenCaptureSource = {
		kind,
		id: parsed?.id ?? options.captureId,
		name: kind === 'window' ? 'Window' : 'Screen',
		width: options.width,
		height: options.height,
	};
	return {
		source,
		captureId: options.captureId,
		desktopCaptureSourceId: parsed?.desktopCaptureSourceId,
		resolution: {
			width: options.width,
			height: options.height,
			...(options.maxFramerate !== undefined ? {frameRate: options.maxFramerate} : {}),
		},
	};
}

function buildTrackPublishOptionsFromControllerScreenPublish(
	options: VoiceEngineV2ScreenOptions,
): TrackPublishOptions | undefined {
	const publishOptions: TrackPublishOptions = {};
	let hasPublishOptions = false;
	if (isScreenShareVideoCodecValue(options.codec)) {
		publishOptions.videoCodec = options.codec;
		hasPublishOptions = true;
	}
	if (options.maxBitrateBps !== undefined) {
		publishOptions.screenShareEncoding = {
			maxBitrate: options.maxBitrateBps,
			...(options.maxFramerate !== undefined ? {maxFramerate: options.maxFramerate} : {}),
		};
		hasPublishOptions = true;
	}
	return hasPublishOptions ? publishOptions : undefined;
}

export function resolveNativeEngineScreenShareRestartCommitTrackSid(args: {
	readonly publishedTrackSid: string | null;
	readonly activeCaptureId: string | null;
	readonly fallbackCaptureId: string;
}): string {
	assert.ok(args !== null && typeof args === 'object', 'commit track sid args must be an object');
	assert.ok(args.fallbackCaptureId.length > 0, 'fallbackCaptureId is required');
	if (args.publishedTrackSid) return args.publishedTrackSid;
	throw new Error('Native screen-share restart commit requires a published LiveKit track SID');
}

function createCryptoNativeScreenShareCaptureId(): string {
	const cryptoPort = globalThis.crypto;
	if (!cryptoPort || typeof cryptoPort.randomUUID !== 'function') {
		throw new Error('Native screen-share capture ID generation requires crypto.randomUUID');
	}
	const id = cryptoPort.randomUUID();
	assert.equal(typeof id, 'string', 'crypto.randomUUID must return a string');
	assert.ok(id.length > 0, 'crypto.randomUUID must return a non-empty capture ID');
	return id;
}

async function captureDeviceShareAudioInputTrack(audioDeviceId: string | undefined): Promise<MediaStreamTrack> {
	assert.ok(navigator.mediaDevices?.getUserMedia, 'getUserMedia is required for device screen-share audio');
	const useExactDevice = audioDeviceId != null && audioDeviceId !== '' && audioDeviceId !== 'default';
	const stream = await navigator.mediaDevices.getUserMedia({
		audio: {
			...(useExactDevice ? {deviceId: {exact: audioDeviceId}} : {}),
			echoCancellation: false,
			noiseSuppression: false,
			autoGainControl: false,
			channelCount: 2,
			sampleRate: 48_000,
		},
	});
	const audioTracks = stream.getAudioTracks();
	const track = audioTracks[0];
	if (!track) {
		for (const other of stream.getTracks()) {
			other.stop();
		}
		throw new Error('No audio track captured for device screen share');
	}
	for (const other of stream.getTracks()) {
		if (other !== track) {
			other.stop();
		}
	}
	prepareHighFidelityScreenShareAudioTrack(track);
	return track;
}

export class VoiceEngineV2AppScreenShareCaptureCoordinator {
	private readonly adapter: VoiceEngineV2AppScreenShareExecutionAdapter;
	private readonly captureIdGenerator: VoiceEngineV2AppScreenShareCaptureIdGenerator;
	private queuedSettingsUpdate: NativeEngineScreenShareSettingsUpdateRequest | null = null;
	private activeCapture: VoiceEngineV2AppScreenShareActiveCaptureRecord = EMPTY_ACTIVE_CAPTURE_RECORD;
	private publicationSidWaiters: Array<NativeEngineScreenSharePublicationSidWaiter> = [];
	private routedStopDepth = 0;

	constructor(
		adapter: VoiceEngineV2AppScreenShareExecutionAdapter,
		options: VoiceEngineV2AppScreenShareCaptureCoordinatorOptions = {},
	) {
		assert.ok(adapter, 'screen-share adapter is required');
		assert.ok(options !== null && typeof options === 'object', 'coordinator options must be an object');
		this.adapter = adapter;
		this.captureIdGenerator = options.captureIdGenerator ?? createCryptoNativeScreenShareCaptureId;
		assert.equal(typeof this.captureIdGenerator, 'function', 'captureIdGenerator must be a function');
	}

	private assertDisplayCapture(
		reason: string,
	): Extract<VoiceEngineV2AppScreenShareActiveCaptureRecord, {kind: 'display'}> {
		assert.equal(typeof reason, 'string', 'display capture assertion reason must be a string');
		if (this.activeCapture.kind !== 'display') {
			throw new Error(`Native screen-share display capture required: ${reason}`);
		}
		return this.activeCapture;
	}

	private assertMutableOptionsState(
		reason: string,
	): Extract<VoiceEngineV2AppScreenShareActiveCaptureRecord, {kind: 'display' | 'restore'}> {
		assert.equal(typeof reason, 'string', 'capture options assertion reason must be a string');
		if (this.activeCapture.kind !== 'display' && this.activeCapture.kind !== 'restore') {
			throw new Error(`Native screen-share options state required: ${reason}`);
		}
		return this.activeCapture;
	}

	private removePublicationSidWaiter(waiter: NativeEngineScreenSharePublicationSidWaiter): void {
		this.publicationSidWaiters = this.publicationSidWaiters.filter((candidate) => candidate !== waiter);
		assert.ok(
			this.publicationSidWaiters.length <= NATIVE_SCREEN_SHARE_PUBLICATION_SID_WAITERS_MAX,
			'publication SID waiter count must stay bounded',
		);
	}

	private resolvePublicationSidWaiters(trackSid: string): void {
		assert.ok(trackSid.length > 0, 'trackSid must not be empty');
		const captureId = this.activeCaptureId;
		if (!captureId) return;
		const remaining: Array<NativeEngineScreenSharePublicationSidWaiter> = [];
		for (const waiter of this.publicationSidWaiters) {
			if (waiter.captureId !== captureId) {
				remaining.push(waiter);
				continue;
			}
			clearTimeout(waiter.timeoutId);
			waiter.resolve(trackSid);
		}
		this.publicationSidWaiters = remaining;
	}

	private rejectPublicationSidWaiters(captureId: string | null, reason: string): void {
		assert.equal(typeof reason, 'string', 'publication SID rejection reason must be a string');
		const remaining: Array<NativeEngineScreenSharePublicationSidWaiter> = [];
		for (const waiter of this.publicationSidWaiters) {
			if (captureId !== null && waiter.captureId !== captureId) {
				remaining.push(waiter);
				continue;
			}
			clearTimeout(waiter.timeoutId);
			waiter.reject(new Error(`Native screen-share publication SID unavailable: ${reason}`));
		}
		this.publicationSidWaiters = remaining;
	}

	private async waitForPublishedTrackSid(captureId: string): Promise<string> {
		assert.ok(captureId.length > 0, 'captureId is required');
		const currentTrackSid = this.activeCapturePublishedTrackSid;
		if (this.activeCaptureId === captureId && currentTrackSid) return currentTrackSid;
		assert.ok(
			this.publicationSidWaiters.length < NATIVE_SCREEN_SHARE_PUBLICATION_SID_WAITERS_MAX,
			'publication SID waiter count exceeded',
		);
		return new Promise((resolve, reject) => {
			const waiter: NativeEngineScreenSharePublicationSidWaiter = {
				captureId,
				resolve,
				reject,
				timeoutId: setTimeout(() => {
					this.removePublicationSidWaiter(waiter);
					reject(new Error('Timed out waiting for native screen-share publication SID'));
				}, NATIVE_SCREEN_SHARE_PUBLICATION_SID_WAIT_MS),
			};
			this.publicationSidWaiters.push(waiter);
		});
	}

	get activeCaptureId(): string | null {
		return this.activeCapture.kind === 'display' ? this.activeCapture.captureId : null;
	}

	set activeCaptureId(value: string | null) {
		if (value !== null) {
			throw new Error('Native screen-share capture id cannot be assigned without a display capture record');
		}
		if (this.activeCapture.kind !== 'display') return;
		this.rejectPublicationSidWaiters(this.activeCapture.captureId, 'capture cleared');
		this.activeCapture = EMPTY_ACTIVE_CAPTURE_RECORD;
	}

	get activeCaptureDimensions(): NativeEngineScreenShareCaptureDimensions | null {
		return this.activeCapture.kind === 'display' ? this.activeCapture.captureDimensions : null;
	}

	set activeCaptureDimensions(value: NativeEngineScreenShareCaptureDimensions | null) {
		if (value === null) {
			if (this.activeCapture.kind !== 'display') return;
			throw new Error('Native screen-share display dimensions cannot be cleared while a display capture is active');
		}
		assert.ok(value.width > 0, 'active screen-share width must be positive');
		assert.ok(value.height > 0, 'active screen-share height must be positive');
		const capture = this.assertDisplayCapture('updating display capture dimensions');
		this.activeCapture = {...capture, captureDimensions: value};
	}

	get activeCaptureOptions(): NativeScreenShareOptions | null {
		if (this.activeCapture.kind === 'display' || this.activeCapture.kind === 'restore') {
			return this.activeCapture.options;
		}
		return null;
	}

	set activeCaptureOptions(value: NativeScreenShareOptions | null) {
		if (value === null) {
			if (this.activeCapture.kind === 'restore') {
				this.activeCapture = EMPTY_ACTIVE_CAPTURE_RECORD;
				return;
			}
			if (this.activeCapture.kind === 'idle') return;
			throw new Error('Native screen-share options cannot be cleared while a capture is active');
		}
		assert.ok(value.source, 'active screen-share options require a source');
		const capture = this.assertMutableOptionsState('updating active capture options');
		this.activeCapture = {...capture, options: value};
	}

	get activeCapturePublishOptions(): TrackPublishOptions | undefined {
		if (this.activeCapture.kind === 'display' || this.activeCapture.kind === 'restore') {
			return this.activeCapture.publishOptions;
		}
		return undefined;
	}

	set activeCapturePublishOptions(value: TrackPublishOptions | undefined) {
		if (value === undefined && this.activeCapture.kind === 'idle') return;
		const capture = this.assertMutableOptionsState('updating active capture publish options');
		this.activeCapture = {...capture, publishOptions: value};
	}

	get activeCapturePublishedTrackSid(): string | null {
		if (this.activeCapture.kind === 'display' || this.activeCapture.kind === 'device') {
			return this.activeCapture.publishedTrackSid;
		}
		return null;
	}

	set activeCapturePublishedTrackSid(value: string | null) {
		assert.ok(value === null || typeof value === 'string', 'published track sid must be a string or null');
		if (value !== null) {
			this.recordPublishedTrackSid(value);
			return;
		}
		if (this.activeCapture.kind === 'display' || this.activeCapture.kind === 'device') {
			this.activeCapture = {...this.activeCapture, publishedTrackSid: null};
		}
	}

	recordPublishedTrackSid(trackSid: string, publication?: NativeVoiceEngineLocalTrackPublication): boolean {
		assert.equal(typeof trackSid, 'string', 'published track sid must be a string');
		assert.ok(trackSid.length > 0, 'published track sid must be non-empty');
		assert.ok(publication === undefined || typeof publication === 'object', 'publication must be an object');
		if (this.activeCapture.kind !== 'display' && this.activeCapture.kind !== 'device') {
			logger.warn('Dropping screen-share published track sid without an active capture', {
				publishedTrackSid: trackSid,
				state: this.activeCapture.kind,
			});
			return false;
		}
		if (this.activeCapture.kind === 'display' && publication?.trackName) {
			if (publication.trackName !== this.activeCapture.captureId) {
				logger.warn('Dropping stale native screen-share publication SID for a different capture', {
					publishedTrackSid: trackSid,
					trackName: publication.trackName,
					activeCaptureId: this.activeCapture.captureId,
				});
				return false;
			}
		}
		this.activeCapture = {...this.activeCapture, publishedTrackSid: trackSid};
		this.resolvePublicationSidWaiters(trackSid);
		return true;
	}

	get deviceCaptureActive(): boolean {
		return this.activeCapture.kind === 'device';
	}

	set deviceCaptureActive(value: boolean) {
		assert.equal(typeof value, 'boolean', 'device capture active flag must be a boolean');
		if (!value) {
			if (this.activeCapture.kind === 'device') {
				this.activeCapture = EMPTY_ACTIVE_CAPTURE_RECORD;
			}
			return;
		}
		if (this.activeCapture.kind === 'display') {
			throw new Error('Native device screen share cannot overlap an active display capture');
		}
		this.activeCapture = {kind: 'device', publishedTrackSid: null};
	}

	private beginActiveCapture(args: {
		captureId: string;
		captureDimensions: NativeEngineScreenShareCaptureDimensions;
		options: NativeScreenShareOptions;
		publishOptions: TrackPublishOptions | undefined;
	}): void {
		assert.ok(args.captureId.length > 0, 'beginActiveCapture requires a captureId');
		assert.ok(args.options.source, 'beginActiveCapture requires capture options with a source');
		assert.ok(args.captureDimensions.width > 0, 'beginActiveCapture requires a positive width');
		assert.ok(args.captureDimensions.height > 0, 'beginActiveCapture requires a positive height');
		if (this.activeCapture.kind === 'display') {
			throw new Error('Native display screen share cannot begin while a display capture is active');
		}
		if (this.activeCapture.kind === 'device') {
			throw new Error('Native display screen share cannot overlap an active device capture');
		}
		this.activeCapture = {
			kind: 'display',
			captureId: args.captureId,
			captureDimensions: args.captureDimensions,
			options: args.options,
			publishOptions: args.publishOptions,
			publishedTrackSid: null,
		};
	}

	private commitActiveCapture(capture: NativeEngineScreenCapture, options: NativeScreenShareOptions): void {
		assert.ok(capture.captureId.length > 0, 'commitActiveCapture requires a captureId');
		assert.ok(capture.width > 0, 'commitActiveCapture requires a positive width');
		assert.ok(capture.height > 0, 'commitActiveCapture requires a positive height');
		assert.ok(options.source, 'commitActiveCapture requires capture options with a source');
		const previous = this.assertDisplayCapture('committing display capture');
		assert.equal(previous.captureId, capture.captureId, 'committed capture ID must match the active display capture');
		this.activeCapture = {
			...previous,
			captureId: capture.captureId,
			captureDimensions: {width: capture.width, height: capture.height},
			options,
		};
	}

	private clearActiveCaptureForRelease(preserveRestoreState: boolean): void {
		assert.equal(typeof preserveRestoreState, 'boolean', 'preserveRestoreState must be a boolean');
		const previous = this.activeCapture;
		this.rejectPublicationSidWaiters(previous.kind === 'display' ? previous.captureId : null, 'capture released');
		if (preserveRestoreState && (previous.kind === 'display' || previous.kind === 'restore')) {
			this.activeCapture = {
				kind: 'restore',
				options: previous.options,
				publishOptions: previous.publishOptions,
			};
		} else {
			this.activeCapture = EMPTY_ACTIVE_CAPTURE_RECORD;
		}
		assert.equal(this.activeCaptureId, null, 'captureId must be cleared on release');
		assert.equal(this.activeCapturePublishedTrackSid, null, 'published track sid must be cleared on release');
		assert.equal(this.deviceCaptureActive, false, 'device capture flag must be cleared on release');
	}

	async publishControllerScreen(options: VoiceEngineV2ScreenOptions): Promise<void> {
		assert.ok(options !== null && typeof options === 'object', 'controller screen options must be an object');
		const nativeOptions = buildNativeOptionsFromControllerScreenPublish(options);
		const publishOptions = buildTrackPublishOptionsFromControllerScreenPublish(options);
		await this.startDisplayCapture(null, nativeOptions, undefined, publishOptions);
	}

	async resolveOptionsFromActiveSource(options?: ScreenShareCaptureOptions): Promise<NativeScreenShareOptions | null> {
		assert.ok(options === undefined || typeof options === 'object');
		const sourceId = ActiveScreenShareSource.getSourceId();
		if (!sourceId) return null;
		assert.equal(typeof sourceId, 'string');
		const parsed = parseDesktopCaptureSourceId(sourceId);
		const kind: NativeScreenCaptureSource['kind'] = parsed
			? parsed.kind
			: sourceId.startsWith('window:')
				? 'window'
				: 'screen';
		const nativeId = parsed ? parsed.id : sourceId;
		const desktopCaptureSourceId = parsed?.desktopCaptureSourceId;
		const resolution = options?.resolution ?? undefined;
		const source: NativeScreenCaptureSource = {
			kind,
			id: nativeId,
			name:
				kind === 'window'
					? i18n._(WINDOW_SCREEN_SHARE_SOURCE_DESCRIPTOR)
					: i18n._(SCREEN_SCREEN_SHARE_SOURCE_DESCRIPTOR),
			width: resolution?.width ?? 1920,
			height: resolution?.height ?? 1080,
		};
		const nativeOptions: NativeScreenShareOptions = {
			source,
			...(desktopCaptureSourceId ? {desktopCaptureSourceId} : {}),
			resolution,
			contentHint: options?.contentHint,
		};
		return this.withAudioIfRequested(
			nativeOptions,
			options?.audio === true || this.shouldIncludeAudioFromSettings(source.kind),
		);
	}

	createCaptureId(): string {
		const id = this.captureIdGenerator();
		assert.equal(typeof id, 'string', 'captureIdGenerator must return a string');
		assert.ok(id.length > 0, 'captureIdGenerator must return a non-empty capture ID');
		return id;
	}

	getPublishDimensions(nativeOptions: NativeScreenShareOptions): {width: number; height: number} {
		assert.ok(nativeOptions);
		assert.ok(nativeOptions.source);
		const dims = {
			width: nativeOptions.resolution?.width ?? nativeOptions.source.width,
			height: nativeOptions.resolution?.height ?? nativeOptions.source.height,
		};
		assert.ok(dims.width > 0, 'width must be > 0');
		assert.ok(dims.height > 0, 'height must be > 0');
		return dims;
	}

	private getCurrentEncodingState(currentOptions: NativeScreenShareOptions): NativeEngineScreenShareEncodingState {
		const previousDimensions = this.activeCaptureDimensions ?? {
			width: currentOptions.source.width,
			height: currentOptions.source.height,
		};
		const publishOptions = this.activeCapturePublishOptions;
		return {
			width: currentOptions.resolution?.width ?? previousDimensions.width,
			height: currentOptions.resolution?.height ?? previousDimensions.height,
			frameRate: publishOptions?.screenShareEncoding?.maxFramerate ?? currentOptions.resolution?.frameRate,
			maxBitrateBps: publishOptions?.screenShareEncoding?.maxBitrate,
			codec: publishOptions?.videoCodec,
		};
	}

	private getRequestedEncodingState(
		currentOptions: NativeScreenShareOptions,
		options?: ScreenShareCaptureOptions,
		publishOptions?: TrackPublishOptions,
	): NativeEngineScreenShareEncodingState {
		const current = this.getCurrentEncodingState(currentOptions);
		const nextResolution = options?.resolution ?? currentOptions.resolution;
		return {
			width: nextResolution?.width ?? current.width,
			height: nextResolution?.height ?? current.height,
			frameRate: nextResolution?.frameRate ?? publishOptions?.screenShareEncoding?.maxFramerate ?? current.frameRate,
			maxBitrateBps: publishOptions?.screenShareEncoding?.maxBitrate ?? current.maxBitrateBps,
			codec: publishOptions?.videoCodec ?? current.codec,
		};
	}

	private hasEncodingStateChanged(
		current: NativeEngineScreenShareEncodingState,
		next: NativeEngineScreenShareEncodingState,
	): boolean {
		return (
			Math.round(current.width) !== Math.round(next.width) ||
			Math.round(current.height) !== Math.round(next.height) ||
			current.frameRate !== next.frameRate ||
			current.maxBitrateBps !== next.maxBitrateBps ||
			current.codec !== next.codec
		);
	}

	private async planSettingsUpdate(
		currentOptions: NativeScreenShareOptions,
		options?: ScreenShareCaptureOptions,
		publishOptions?: TrackPublishOptions,
	): Promise<NativeEngineScreenShareSettingsUpdatePlan> {
		const current = this.getCurrentEncodingState(currentOptions);
		const next = this.getRequestedEncodingState(currentOptions, options, publishOptions);
		if (!this.hasEncodingStateChanged(current, next)) return {action: 'noop'};
		if (current.codec !== next.codec) return {action: 'restart', reason: 'codec-changed'};
		const canUpdateEncoding = await isVoiceEngineV2AppNativeScreenShareEncodingUpdateAvailable();
		if (!canUpdateEncoding) return {action: 'restart', reason: 'encoding-update-unavailable'};
		return {action: 'update-encoding', state: next};
	}

	private async updateEncodingInPlaceForSettings(
		currentOptions: NativeScreenShareOptions,
		state: NativeEngineScreenShareEncodingState,
	): Promise<boolean> {
		const captureId = this.activeCaptureId;
		if (!captureId) return false;
		assert.ok(state.width > 0, 'in-place screen-share width must be positive');
		assert.ok(state.height > 0, 'in-place screen-share height must be positive');
		await requireVoiceEngineV2AppNativeBridge('update native screen share encoding').updateScreenShareEncoding({
			captureId,
			width: state.width,
			height: state.height,
			frameRate: state.frameRate,
			maxBitrateBps: state.maxBitrateBps,
		});
		const resolution = {
			width: state.width,
			height: state.height,
			...(state.frameRate !== undefined ? {frameRate: state.frameRate} : {}),
		};
		this.activeCaptureDimensions = {width: state.width, height: state.height};
		this.activeCaptureOptions = {
			...currentOptions,
			resolution,
		};
		logger.info('Updated native-engine screen share encoding in place', {
			captureId,
			width: state.width,
			height: state.height,
			frameRate: state.frameRate,
		});
		return true;
	}

	private queueSettingsUpdate(
		room: Room | null,
		options?: ScreenShareCaptureOptions,
		publishOptions?: TrackPublishOptions,
	): void {
		this.queuedSettingsUpdate = {room, options, publishOptions};
	}

	async applyQueuedSettingsUpdate(): Promise<void> {
		const queued = this.queuedSettingsUpdate;
		if (!queued) return;
		assert.ok(queued, 'queued must be present after early-return');
		this.queuedSettingsUpdate = null;
		await this.updateActiveSettings(queued.room, queued.options, queued.publishOptions).catch((error) => {
			logger.warn('Failed to apply queued native-engine screen-share settings update', {error});
		});
	}

	shouldIncludeAudioFromSettings(sourceKind: NativeScreenCaptureSource['kind']): boolean {
		assert.equal(typeof sourceKind, 'string');
		if (VoiceSettings.getScreenShareAudioSourceMode() === 'none') return false;
		if (sourceKind === 'screen') return VoiceSettings.getShareDesktopAudio();
		if (sourceKind === 'game') return VoiceSettings.getShareDesktopAudio();
		if (sourceKind === 'window') return VoiceSettings.getShareAppAudio();
		return false;
	}

	private isActiveFluxerOwnedWindow(nativeOptions: NativeScreenShareOptions): boolean {
		assert.ok(nativeOptions.source, 'nativeOptions.source is required');
		if (nativeOptions.source.kind !== 'window') return false;
		if (!ActiveScreenShareSource.isOwnWindow()) return false;
		const activeSourceId = ActiveScreenShareSource.getSourceId();
		if (!activeSourceId) return false;
		if (nativeOptions.desktopCaptureSourceId === activeSourceId) return true;
		return nativeOptions.source.id === activeSourceId;
	}

	private async captureAudioOptions(
		nativeOptions: NativeScreenShareOptions,
	): Promise<Pick<NativeScreenShareOptions, 'audioTrack' | 'nativeAudioFramePump' | 'nativeAudioLinuxRule'> | null> {
		if (nativeOptions.nativeAudioLinuxRule) {
			return {nativeAudioLinuxRule: nativeOptions.nativeAudioLinuxRule};
		}
		if (nativeOptions.nativeAudioFramePump) {
			return {nativeAudioFramePump: nativeOptions.nativeAudioFramePump};
		}
		const electronApi = getElectronAPI();
		if (!electronApi) return null;
		if (nativeOptions.source.kind === 'screen' || nativeOptions.source.kind === 'game') {
			if (electronApi.platform === 'darwin' || electronApi.platform === 'win32') {
				return {nativeAudioFramePump: {kind: 'system'}};
			}
			return null;
		}
		if (nativeOptions.source.kind !== 'window') return null;
		let targetPid = nativeOptions.source.targetPid ?? null;
		if (nativeOptions.desktopCaptureSourceId && electronApi.nativeAudio) {
			const resolvedPid = await electronApi.nativeAudio
				.resolveAudioRootPidForSource(nativeOptions.desktopCaptureSourceId)
				.catch((error) => {
					logger.warn('Failed to resolve native screen-share audio PID for live settings update', {
						desktopSourceId: nativeOptions.desktopCaptureSourceId,
						platform: electronApi.platform,
						error,
					});
					return null;
				});
			if (typeof resolvedPid === 'number' && resolvedPid > 0) {
				targetPid = resolvedPid;
			}
		}
		if (!targetPid) return null;
		return {nativeAudioFramePump: {kind: 'window', targetPid}};
	}

	async withAudioIfRequested(
		nativeOptions: NativeScreenShareOptions,
		includeAudio: boolean,
	): Promise<NativeScreenShareOptions | null> {
		assert.ok(nativeOptions);
		assert.equal(typeof includeAudio, 'boolean');
		if (!includeAudio) return nativeOptions;
		if (nativeOptions.audioTrack) return nativeOptions;
		if (nativeOptions.nativeAudioFramePump) return nativeOptions;
		if (nativeOptions.nativeAudioLinuxRule) return nativeOptions;
		if (this.isActiveFluxerOwnedWindow(nativeOptions)) {
			logger.warn('Native voice engine: Fluxer-owned window audio is excluded from screen share capture', {
				sourceId: nativeOptions.desktopCaptureSourceId ?? nativeOptions.source.id,
			});
			return nativeOptions;
		}
		const audioOptions = await this.captureAudioOptions(nativeOptions);
		if (!audioOptions) {
			logger.warn('Native voice engine: screen-share audio was requested but native audio capture was unavailable', {
				sourceKind: nativeOptions.source.kind,
				sourceId: nativeOptions.source.id,
				reason: getLastNativeAudioArmFailure()?.reason ?? null,
				detail: getLastNativeAudioArmFailure()?.detail ?? null,
			});
			return null;
		}
		return {...nativeOptions, ...audioOptions};
	}

	private async updateAudioForSettings(
		currentOptions: NativeScreenShareOptions,
		includeAudio: boolean,
	): Promise<boolean> {
		if (!includeAudio) {
			if (!this.adapter.nativeEngineScreenShareAudioPump) return false;
			await this.adapter.audioPump.stopAudio();
			const {
				audioTrack: _audioTrack,
				nativeAudioFramePump: _nativeAudioFramePump,
				nativeAudioLinuxRule: _nativeAudioLinuxRule,
				...nextOptions
			} = currentOptions;
			this.activeCaptureOptions = nextOptions;
			LocalVoiceState.updateSelfStreamAudio(false);
			return true;
		}
		if (this.adapter.nativeEngineScreenShareAudioPump) return false;
		const nextOptions = await this.withAudioIfRequested(currentOptions, true);
		if (!nextOptions || nextOptions === currentOptions) {
			logger.warn('Native-engine screen-share audio could not be enabled for active share', {
				sourceKind: currentOptions.source.kind,
				sourceId: currentOptions.source.id,
				reason: getLastNativeAudioArmFailure()?.reason ?? null,
			});
			LocalVoiceState.updateSelfStreamAudio(false);
			return false;
		}
		let audioPublished = false;
		try {
			audioPublished = await this.adapter.audioPump.startAudio(nextOptions);
		} catch (error) {
			logger.warn('Native-engine screen-share audio start failed for active share; continuing video-only', {
				sourceKind: currentOptions.source.kind,
				sourceId: currentOptions.source.id,
				error,
			});
			LocalVoiceState.updateSelfStreamAudio(false);
			return false;
		}
		if (!audioPublished) {
			LocalVoiceState.updateSelfStreamAudio(false);
			return false;
		}
		this.activeCaptureOptions = nextOptions;
		LocalVoiceState.updateSelfStreamAudio(true);
		return true;
	}

	async updateActiveSettings(
		room: Room | null,
		options?: ScreenShareCaptureOptions,
		publishOptions?: TrackPublishOptions,
	): Promise<boolean> {
		assert.ok(room === null || typeof room === 'object');
		assert.ok(options === undefined || typeof options === 'object');
		const currentOptions = this.activeCaptureOptions;
		if (!this.activeCaptureId || !currentOptions) return false;
		const pendingVerdict = guardScreenShareEntry({
			pending: {
				active: this.adapter.isScreenSharePending,
				debugMessage: 'Already pending, queued native-engine screen-share settings update',
				onBlocked: () => {
					this.queueSettingsUpdate(room, options, publishOptions);
				},
			},
		});
		if (pendingVerdict === 'share-pending') {
			return false;
		}
		const audioSettingProvided = typeof options?.audio === 'boolean';
		const audioEnabled = audioSettingProvided
			? options.audio === true
			: this.adapter.nativeEngineScreenShareAudioPump != null;
		let appliedAnySetting = false;
		try {
			const videoPlan = await this.planSettingsUpdate(currentOptions, options, publishOptions);
			if (videoPlan.action === 'update-encoding') {
				const inPlaceApplied = await this.updateEncodingInPlaceForSettings(currentOptions, videoPlan.state).catch(
					(error) => {
						logger.warn('Failed to update native-engine screen share encoding in place; falling back to restart', {
							error,
						});
						return false;
					},
				);
				appliedAnySetting = inPlaceApplied || appliedAnySetting;
				if (!inPlaceApplied) {
					appliedAnySetting =
						(await this.restartForSettings(room, currentOptions, options, publishOptions)) || appliedAnySetting;
				}
			} else if (videoPlan.action === 'restart') {
				logger.info('Restarting native-engine screen share for settings update', {reason: videoPlan.reason});
				appliedAnySetting =
					(await this.restartForSettings(room, currentOptions, options, publishOptions)) || appliedAnySetting;
			}
			const latestOptions = this.activeCaptureOptions ?? currentOptions;
			if (audioSettingProvided) {
				appliedAnySetting = (await this.updateAudioForSettings(latestOptions, audioEnabled)) || appliedAnySetting;
			}
			if (options && Object.hasOwn(options, 'contentHint')) {
				this.activeCaptureOptions = {
					...(this.activeCaptureOptions ?? latestOptions),
					contentHint: options.contentHint,
				};
				appliedAnySetting = true;
			}
			if (publishOptions) {
				this.activeCapturePublishOptions = publishOptions;
			}
			return appliedAnySetting;
		} finally {
			await this.applyQueuedSettingsUpdate();
		}
	}

	private async restoreAfterRestartFailure(
		currentOptions: NativeScreenShareOptions,
		previousPublishOptions: TrackPublishOptions | undefined,
		sourceType: VoiceScreenShareSourceType,
		previousCaptureId: string | null,
	): Promise<void> {
		assert.ok(currentOptions);
		try {
			if (!this.activeCaptureId) {
				await this.startCapture(
					currentOptions,
					{sendUpdate: false, playSound: false, allowDuringPending: true},
					previousPublishOptions,
				);
			}
			this.adapter.transitionScreenShareLifecycleInternal({
				type: 'share.resolve',
				active: true,
				sourceType,
				encoderVerificationScheduled: false,
				streamingPriorityHeld: this.adapter.streamingPriorityHeld,
			});
		} catch (restoreError) {
			logger.error('Failed to restore native-engine screen share after restart failure', {
				previousCaptureId,
				error: restoreError,
			});
			this.adapter.transitionScreenShareLifecycleInternal({
				type: 'share.reject',
				active: false,
				sourceType,
			});
		}
	}

	private async buildRestartNativeOptions(
		currentOptions: NativeScreenShareOptions,
		options: ScreenShareCaptureOptions | undefined,
		nextCaptureId: string,
	): Promise<NativeScreenShareOptions | null> {
		assert.ok(currentOptions.source, 'currentOptions.source is required');
		assert.ok(nextCaptureId.length > 0, 'nextCaptureId is required');
		const {
			audioTrack: _audioTrack,
			nativeAudioFramePump: _nativeAudioFramePump,
			nativeAudioLinuxRule: _nativeAudioLinuxRule,
			...baseOptions
		} = currentOptions;
		const nextResolution = options?.resolution ?? currentOptions.resolution;
		const nextOptions: NativeScreenShareOptions = {
			...baseOptions,
			captureId: nextCaptureId,
			...(nextResolution ? {resolution: nextResolution} : {}),
		};
		if (options && Object.hasOwn(options, 'contentHint')) {
			nextOptions.contentHint = options.contentHint;
		}
		const includeAudio =
			this.adapter.nativeEngineScreenShareAudioPump != null ||
			currentOptions.audioTrack != null ||
			currentOptions.nativeAudioFramePump != null ||
			currentOptions.nativeAudioLinuxRule != null;
		return this.withAudioIfRequested(nextOptions, includeAudio);
	}

	private async restartForSettings(
		room: Room | null,
		currentOptions: NativeScreenShareOptions,
		options?: ScreenShareCaptureOptions,
		publishOptions?: TrackPublishOptions,
	): Promise<boolean> {
		assert.ok(room === null || typeof room === 'object');
		const sourceType = this.adapter.getNativeScreenShareSourceType(currentOptions);
		const previousPublishOptions = this.activeCapturePublishOptions;
		const nextResolution = options?.resolution ?? currentOptions.resolution;
		const nextPublishOptions = publishOptions ?? previousPublishOptions;
		const previousCaptureId = this.activeCaptureId;
		const nextCaptureId = this.createCaptureId();
		const nextNativeOptions = await this.buildRestartNativeOptions(currentOptions, options, nextCaptureId);
		if (!nextNativeOptions) throw new Error('Native screen-share audio unavailable during settings republish');
		const migration = await announceScreenShareRestartMigration({
			room,
			generation: ++this.adapter.screenShareMigrationGeneration,
			previousPublishOptions,
			nextPublishOptions,
			candidateTrackSid: nextCaptureId,
			reason: 'native-engine-screen-share-settings-republish',
		});
		this.adapter.transitionScreenShareLifecycleInternal({
			type: 'share.replace',
			sourceType,
			codecRepublishInFlight: true,
		});
		try {
			await this.adapter.releaseNativeEngineScreenShareResourcesInternal({
				reason: 'native-engine-screen-share-settings-republish',
				preserveRestoreState: true,
				releaseStreamingPriority: false,
				unpublishRemote: true,
				preserveStreamStateOnUnpublish: true,
			});
			await this.startCapture(
				nextNativeOptions,
				{sendUpdate: false, playSound: false, allowDuringPending: true},
				nextPublishOptions,
			);
			const publishedTrackSid = migration ? await this.waitForPublishedTrackSid(nextCaptureId) : null;
			if (migration) {
				await commitScreenShareRestartMigration(
					room,
					migration,
					resolveNativeEngineScreenShareRestartCommitTrackSid({
						publishedTrackSid,
						activeCaptureId: this.activeCaptureId,
						fallbackCaptureId: nextCaptureId,
					}),
				);
			}
			logger.info('Restarted native-engine screen share for settings change', {
				previousCaptureId,
				captureId: this.activeCaptureId,
				resolution: nextResolution,
				frameRate: nextResolution?.frameRate,
				maxBitrateBps: nextPublishOptions?.screenShareEncoding?.maxBitrate,
			});
			return true;
		} catch (error) {
			await this.abortRestartMigration(room, migration);
			logger.warn('Failed to restart native-engine screen share for settings change; attempting restore', {
				previousCaptureId,
				error,
			});
			await this.restoreAfterRestartFailure(currentOptions, previousPublishOptions, sourceType, previousCaptureId);
			return false;
		}
	}

	private async abortRestartMigration(
		room: Room | null,
		migration: ScreenShareRestartMigrationSession | null,
	): Promise<void> {
		await abortScreenShareRestartMigration(room, migration, 'native-engine-screen-share-settings-republish-failed');
	}

	clearRestoreState(): void {
		if (this.activeCapture.kind === 'restore') {
			this.activeCapture = EMPTY_ACTIVE_CAPTURE_RECORD;
		}
		assert.equal(this.activeCaptureOptions, null, 'options must be cleared');
		assert.equal(this.activeCapturePublishOptions, undefined, 'publishOptions must be cleared');
		assert.equal(this.activeCapturePublishedTrackSid, null, 'published track sid must be cleared');
	}

	private cleanupEndListener(): void {
		this.adapter.nativeEngineScreenShareEndDisposer?.();
		this.adapter.nativeEngineScreenShareEndDisposer = null;
		const lastCaptureId = this.adapter.nativeEngineScreenShareLifecycleBoundCaptureId;
		if (lastCaptureId) {
			this.adapter.sourceLifecycleBridge?.unbind(lastCaptureId);
			this.adapter.nativeEngineScreenShareLifecycleBoundCaptureId = null;
		}
	}

	private bindEndListener(captureId: string): void {
		this.cleanupEndListener();
		assert.equal(typeof captureId, 'string', 'captureId must be a string');
		assert.ok(captureId.length > 0, 'captureId must not be empty');
		const sourceId = this.activeCaptureOptions?.source.id;
		if (sourceId && this.adapter.sourceLifecycleBridge) {
			const bound = this.adapter.sourceLifecycleBridge.bind({captureId, sourceId});
			if (bound) {
				this.adapter.nativeEngineScreenShareLifecycleBoundCaptureId = captureId;
			}
		}
		const unsubscribe = getElectronAPI()?.nativeScreenCapture?.onEnd?.((message) => {
			if (message.captureId !== captureId || message.captureId !== this.activeCaptureId) return;
			if (message.reason !== 'source-vanished') return;
			logger.warn('Native-engine screen-share source vanished', {captureId, detail: message.detail});
			this.adapter.showScreenShareEndedModalInternal(i18n._(SCREEN_SHARE_SOURCE_NO_LONGER_AVAILABLE_DESCRIPTOR));
			void this.stopCapture({
				sendUpdate: true,
				playSound: true,
				reason: 'native-engine-screen-share-source-vanished',
			}).catch((error) => {
				logger.warn('Failed to stop native-engine screen share after source vanished', {captureId, error});
			});
		});
		this.adapter.nativeEngineScreenShareEndDisposer = unsubscribe ?? null;
	}

	async releaseResources({
		reason,
		preserveRestoreState = false,
		releaseStreamingPriority = true,
		unpublishRemote = true,
		preserveStreamStateOnUnpublish = false,
	}: {
		reason: string;
		preserveRestoreState?: boolean;
		releaseStreamingPriority?: boolean;
		unpublishRemote?: boolean;
		preserveStreamStateOnUnpublish?: boolean;
	}): Promise<void> {
		assert.equal(typeof reason, 'string');
		assert.equal(typeof preserveRestoreState, 'boolean');
		const captureId = this.activeCaptureId;
		const deviceScreenShareActive = this.deviceCaptureActive;
		const nativeScreenPublicationActive =
			captureId !== null || deviceScreenShareActive || this.activeCapturePublishedTrackSid !== null;
		const nativeScreenAudioPublicationActive = this.adapter.nativeEngineScreenShareAudioPump !== null;
		this.clearActiveCaptureForRelease(preserveRestoreState);
		this.cleanupEndListener();
		this.adapter.clearScreenShareKeepAliveSinkInternal();
		this.adapter.cancelEncoderVerificationInternal();
		AdaptiveScreenShareEngine.stop();
		if (releaseStreamingPriority) {
			this.adapter.setStreamingPriorityInternal(false);
		}
		await this.adapter.audioPump.stopAudio(true, unpublishRemote && nativeScreenAudioPublicationActive);
		this.adapter.previewTracking.clearPreview();
		if (unpublishRemote && nativeScreenPublicationActive) {
			if (preserveStreamStateOnUnpublish) {
				applyScreenShareState(this.adapter, true, false);
				this.adapter.syncLocalStreamWatchStateInternal(true);
			}
			if (await isVoiceEngineV2AppNativeScreenShareBridgeAvailable()) {
				try {
					await requireVoiceEngineV2AppNativeBridge('unpublish native screen share').unpublishScreen();
				} catch (error) {
					logger.warn('Native-engine screen-share unpublish failed', {error, reason});
				}
			} else {
				logger.warn('Native-engine screen-share unpublish skipped because bridge is unavailable', {reason});
			}
		}

		if (captureId) {
			await stopNativeCaptureForEngine(captureId);
			markScreenShareCaptureEnded(reason);
		} else if (deviceScreenShareActive) {
			markScreenShareCaptureEnded(reason);
		}
	}

	private async publishAndStartNativeCapture(
		nativeOptions: NativeScreenShareOptions,
		publishOptions: TrackPublishOptions | undefined,
		effectivePublishOptions: TrackPublishOptions | undefined,
	): Promise<NativeEngineScreenCapture> {
		assert.ok(nativeOptions);
		assert.ok(nativeOptions.source);
		const captureId = nativeOptions.captureId ?? this.createCaptureId();
		const publishDimensions = this.getPublishDimensions(nativeOptions);
		this.beginActiveCapture({
			captureId,
			captureDimensions: publishDimensions,
			options: nativeOptions,
			publishOptions,
		});
		const adaptiveScreenShareQuality = VoiceSettings.getAdaptiveScreenShareQuality();
		const maxFramerate =
			effectivePublishOptions?.screenShareEncoding?.maxFramerate ?? nativeOptions.resolution?.frameRate;
		await requireVoiceEngineV2AppNativeBridge('publish native screen share').publishScreen({
			captureId,
			width: publishDimensions.width,
			height: publishDimensions.height,
			codec: effectivePublishOptions?.videoCodec,
			maxBitrateBps: effectivePublishOptions?.screenShareEncoding?.maxBitrate,
			maxFramerate,
			adaptiveSend: adaptiveScreenShareQuality,
			pacing: 'source',
			trackName: captureId,
		});
		const capture = await startNativeCaptureForEngine({...nativeOptions, captureId});
		this.commitActiveCapture(capture, nativeOptions);
		this.bindEndListener(capture.captureId);
		this.adapter.previewTracking.registerCapturePreview(capture);
		return capture;
	}

	private async publishCaptureAudio(
		nativeOptions: NativeScreenShareOptions,
		capture: NativeEngineScreenCapture,
	): Promise<boolean> {
		assert.ok(nativeOptions);
		assert.ok(capture);
		const audioPublished = await this.adapter.audioPump.startAudio(nativeOptions);
		if (audioPublished) return true;
		if (!nativeOptions.audioTrack && !nativeOptions.nativeAudioLinuxRule) return false;
		logger.warn('Native-engine screen-share audio was requested but not published; continuing video-only', {
			captureId: capture.captureId,
			hasAudioTrack: nativeOptions.audioTrack != null,
			hasNativeAudioFramePump: nativeOptions.nativeAudioFramePump != null,
			hasLinuxRule: nativeOptions.nativeAudioLinuxRule != null,
		});
		this.stopUnpublishedAudioTrack(nativeOptions, capture.captureId, 'audio-not-published');
		return false;
	}

	private stopUnpublishedAudioTrack(
		nativeOptions: NativeScreenShareOptions,
		captureId: string | null,
		reason: string,
	): void {
		assert.ok(nativeOptions);
		assert.equal(typeof reason, 'string');
		if (this.adapter.nativeEngineScreenShareAudioPump) return;
		if (!nativeOptions.audioTrack) return;
		try {
			nativeOptions.audioTrack.stop();
		} catch (error) {
			logger.debug('Failed to stop unpublished native-engine screen-share audio track', {
				captureId,
				reason,
				error,
			});
		}
	}

	private async finalizeCaptureSuccess(
		nativeOptions: NativeScreenShareOptions,
		capture: NativeEngineScreenCapture,
		sourceType: VoiceScreenShareSourceType,
		sendUpdate: boolean,
		playSound: boolean,
		audioPublished: boolean,
	): Promise<void> {
		assert.ok(capture);
		assert.equal(typeof sendUpdate, 'boolean');
		await runScreenShareActivationRitual({
			adapter: this.adapter,
			room: null,
			participant: null,
			active: true,
			steps: {
				acquireStreamingPriority: true,
				enforcePublicationCap: false,
				applyState: () => applyScreenShareState(this.adapter, true, sendUpdate, sendUpdate),
				applyStatePosition: 'before-pipeline',
				publishPipeline: null,
				deactivateCleanup: null,
				updateLocalParticipant: false,
				audioSync: {kind: 'self-stream-before-watch', published: audioPublished},
				syncPersistedAudioPreferenceWhenActive: false,
				playSound,
				buildResolveTransition: () => ({
					type: 'share.resolve',
					active: true,
					sourceType,
					encoderVerificationScheduled: false,
					streamingPriorityHeld: this.adapter.streamingPriorityHeld,
				}),
			},
		});
		logger.info('Started native-engine screen share', {
			sourceKind: nativeOptions.source.kind,
			captureId: capture.captureId,
		});
	}

	private async handleStartCaptureFailure(
		nativeOptions: NativeScreenShareOptions,
		capture: NativeEngineScreenCapture | null,
		sourceType: VoiceScreenShareSourceType,
		sendUpdate: boolean,
		error: unknown,
	): Promise<void> {
		assert.ok(nativeOptions);
		logger.warn('Failed to start native-engine screen share', {error});
		if (capture && !this.adapter.nativeEngineScreenSharePreviewTrackSid) {
			await capture.previewBridge.cleanup(false).catch((cleanupError) => {
				logger.warn('Failed to clean up native-engine screen-share preview after start failure', {
					captureId: capture?.captureId,
					error: cleanupError,
				});
			});
		}
		this.stopUnpublishedAudioTrack(nativeOptions, capture?.captureId ?? null, 'start-capture-failed');
		await this.stopCaptureDirect({sendUpdate, playSound: false}).catch((stopError) => {
			logger.warn('Failed to stop native-engine screen share after start failure', {error: stopError});
		});
		this.adapter.transitionScreenShareLifecycleInternal({
			type: 'share.resolve',
			active: false,
			sourceType,
			encoderVerificationScheduled: false,
			streamingPriorityHeld: this.adapter.streamingPriorityHeld,
		});
	}

	async startCapture(
		nativeOptions: NativeScreenShareOptions,
		options?: NativeEngineScreenShareStartCaptureOptions,
		publishOptions?: TrackPublishOptions,
	): Promise<void> {
		assert.ok(nativeOptions);
		assert.ok(nativeOptions.source);
		const {sendUpdate = true, playSound = true, allowDuringPending = false} = options || {};
		assert.equal(typeof sendUpdate, 'boolean');
		assert.equal(typeof allowDuringPending, 'boolean');
		if (!allowDuringPending) {
			const pendingVerdict = guardScreenShareEntry({
				pending: {
					active: this.adapter.isScreenSharePending,
					debugMessage: 'Already pending, ignoring native-engine screen share request',
				},
			});
			if (pendingVerdict === 'share-pending') {
				return;
			}
		}
		const sourceType = this.adapter.getNativeScreenShareSourceType(nativeOptions);
		this.adapter.transitionScreenShareLifecycleInternal({type: 'share.start', sourceType});
		let capture: NativeEngineScreenCapture | null = null;
		try {
			const effectivePublishOptions = await this.adapter.getEffectivePublishOptionsInternal(true, publishOptions);
			capture = await this.publishAndStartNativeCapture(nativeOptions, publishOptions, effectivePublishOptions);
			const audioPublished = await this.publishCaptureAudio(nativeOptions, capture);
			await this.finalizeCaptureSuccess(nativeOptions, capture, sourceType, sendUpdate, playSound, audioPublished);
			await this.applyQueuedSettingsUpdate();
		} catch (error) {
			await this.handleStartCaptureFailure(nativeOptions, capture, sourceType, sendUpdate, error);
			throw error;
		}
	}

	private async publishDeviceCaptureEngine(
		options: DeviceScreenShareCaptureOptions | undefined,
		effectivePublishOptions: TrackPublishOptions | undefined,
		publishDimensions: {width: number; height: number; frameRate: number},
	): Promise<void> {
		assert.ok(publishDimensions);
		assert.ok(publishDimensions.frameRate > 0);
		const videoDeviceId = options?.videoDeviceId;
		await ensureNativeCameraPermissionForDeviceShare('start');
		await requireVoiceEngineV2AppNativeBridge('publish native device screen share').publishDeviceScreenShare({
			...(videoDeviceId && videoDeviceId !== 'default' ? {deviceId: videoDeviceId} : {}),
			width: publishDimensions.width,
			height: publishDimensions.height,
			frameRate: publishDimensions.frameRate,
			...(isScreenShareVideoCodecValue(effectivePublishOptions?.videoCodec)
				? {codec: effectivePublishOptions.videoCodec}
				: {}),
			maxBitrateBps: effectivePublishOptions?.screenShareEncoding?.maxBitrate,
			maxFramerate: effectivePublishOptions?.screenShareEncoding?.maxFramerate ?? publishDimensions.frameRate,
		});
	}

	private async publishDeviceCaptureAudio(options: DeviceScreenShareCaptureOptions | undefined): Promise<boolean> {
		const audioDeviceId = options?.audioDeviceId;
		if (audioDeviceId === undefined) {
			return false;
		}
		await ensureNativeMicrophonePermissionForDeviceShare('start');
		let audioTrack: MediaStreamTrack | null = null;
		try {
			audioTrack = await captureDeviceShareAudioInputTrack(audioDeviceId);
			const published = await this.adapter.audioPump.startAudioFromTrack(audioTrack, audioDeviceId || 'default');
			if (!published) {
				audioTrack.stop();
			}
			return published;
		} catch (error) {
			logger.warn('Native-engine device screen-share audio was requested but not published; continuing video-only', {
				audioDeviceId,
				error,
			});
			if (audioTrack && this.adapter.nativeEngineScreenShareAudioPump === null) {
				audioTrack.stop();
			}
			return false;
		}
	}

	private async finalizeDeviceCaptureSuccess(
		options: DeviceScreenShareCaptureOptions | undefined,
		effectivePublishOptions: TrackPublishOptions | undefined,
		publishDimensions: {width: number; height: number; frameRate: number},
		sendUpdate: boolean,
		playSound: boolean,
		audioPublished: boolean,
	): Promise<void> {
		assert.equal(typeof sendUpdate, 'boolean');
		assert.equal(typeof audioPublished, 'boolean');
		assert.ok(publishDimensions);
		this.deviceCaptureActive = true;
		this.adapter.previewTracking.registerDevicePreview(options, publishDimensions);
		markScreenShareCaptureActive({method: 'device-media', device: {videoDeviceId: options?.videoDeviceId}});
		await runScreenShareActivationRitual({
			adapter: this.adapter,
			room: null,
			participant: null,
			active: true,
			steps: {
				acquireStreamingPriority: true,
				enforcePublicationCap: false,
				applyState: () => applyScreenShareState(this.adapter, true, sendUpdate, sendUpdate),
				applyStatePosition: 'before-pipeline',
				publishPipeline: null,
				deactivateCleanup: null,
				updateLocalParticipant: false,
				audioSync: {kind: 'self-stream-before-watch', published: audioPublished},
				syncPersistedAudioPreferenceWhenActive: false,
				playSound,
				buildResolveTransition: () => ({
					type: 'share.resolve',
					active: true,
					sourceType: 'device',
					encoderVerificationScheduled: false,
					streamingPriorityHeld: this.adapter.streamingPriorityHeld,
				}),
			},
		});
		logger.info('Started native-engine device screen share', {
			videoDeviceId: options?.videoDeviceId,
			previewVideoDeviceId: options?.previewVideoDeviceId,
			width: publishDimensions.width,
			height: publishDimensions.height,
			frameRate: publishDimensions.frameRate,
			codec: effectivePublishOptions?.videoCodec,
			maxBitrateBps: effectivePublishOptions?.screenShareEncoding?.maxBitrate,
			maxFramerate: effectivePublishOptions?.screenShareEncoding?.maxFramerate,
		});
	}

	private async assertNativeBridgeAvailable(context: string): Promise<void> {
		assert.equal(typeof context, 'string');
		assert.ok(context.length > 0, 'native bridge availability context is required');
		if (await isVoiceEngineV2AppNativeScreenShareBridgeAvailable()) return;
		throw new Error(`Voice engine v2 native bridge is required for ${context}`);
	}

	async startDeviceCapture(
		options?: DeviceScreenShareCaptureOptions,
		startOptions?: {sendUpdate?: boolean; playSound?: boolean},
		publishOptions?: TrackPublishOptions,
	): Promise<void> {
		const {sendUpdate = true, playSound = true} = startOptions || {};
		assert.equal(typeof sendUpdate, 'boolean');
		assert.equal(typeof playSound, 'boolean');
		const pendingVerdict = guardScreenShareEntry({
			pending: {
				active: this.adapter.isScreenSharePending,
				debugMessage: 'Already pending, ignoring native-engine device screen share request',
			},
		});
		if (pendingVerdict === 'share-pending') {
			return;
		}
		await this.assertNativeBridgeAvailable('device screen share capture');
		this.adapter.transitionScreenShareLifecycleInternal({type: 'share.start', sourceType: 'device'});
		try {
			const effectivePublishOptions = await this.adapter.getEffectivePublishOptionsInternal(true, publishOptions);
			const publishDimensions = getDeviceScreenSharePublishDimensions(options);
			await this.publishDeviceCaptureEngine(options, effectivePublishOptions, publishDimensions);
			const audioPublished = await this.publishDeviceCaptureAudio(options);
			await this.finalizeDeviceCaptureSuccess(
				options,
				effectivePublishOptions,
				publishDimensions,
				sendUpdate,
				playSound,
				audioPublished,
			);
		} catch (error) {
			logger.warn('Failed to start native-engine device screen share', {error, videoDeviceId: options?.videoDeviceId});
			await this.stopCaptureDirect({
				sendUpdate,
				playSound: false,
				reason: 'native-engine-device-screen-share-failed',
			}).catch((stopError) => {
				logger.warn('Failed to stop native-engine device screen share after start failure', {error: stopError});
			});
			this.adapter.transitionScreenShareLifecycleInternal({
				type: 'share.reject',
				active: LocalVoiceState.getSelfStream(),
				sourceType: LocalVoiceState.getSelfStream() ? 'device' : null,
			});
			throw error;
		}
	}

	async stopCapture(options?: {sendUpdate?: boolean; playSound?: boolean; reason?: string}): Promise<void> {
		const {sendUpdate = true, playSound = true, reason = 'native-engine-screen-share-stopped'} = options || {};
		assert.equal(typeof sendUpdate, 'boolean');
		assert.equal(typeof reason, 'string');
		if (this.routedStopDepth > 0) {
			await this.stopCaptureDirect({sendUpdate, playSound, reason});
			return;
		}
		if (!this.adapter.controllerRouting.isStopRoutable()) {
			await this.stopCaptureDirect({sendUpdate, playSound, reason});
			return;
		}
		this.routedStopDepth += 1;
		try {
			const routedOptions: VoiceEngineV2AppScreenShareSetEnabledOptions = {sendUpdate, playSound, reason};
			await this.adapter.setScreenShareEnabled(null, false, routedOptions);
		} finally {
			this.routedStopDepth -= 1;
			assert.ok(this.routedStopDepth >= 0, 'routed stop depth must not go negative');
		}
	}

	async stopCaptureDirect(options?: {sendUpdate?: boolean; playSound?: boolean; reason?: string}): Promise<void> {
		const {sendUpdate = true, playSound = true, reason = 'native-engine-screen-share-stopped'} = options || {};
		assert.equal(typeof sendUpdate, 'boolean');
		assert.equal(typeof reason, 'string');
		await this.releaseResources({reason});
		applyScreenShareState(this.adapter, false, sendUpdate, sendUpdate);
		LocalVoiceState.updateSelfStreamAudio(false);
		this.adapter.syncLocalStreamWatchStateInternal(false);
		if (playSound) {
			SoundCommands.playSound(SoundType.ScreenShareStop);
		}
	}

	async startDisplayCapture(
		_room: Room | null,
		nativeOptions: NativeScreenShareOptions,
		options?: {
			sendUpdate?: boolean;
			playSound?: boolean;
		},
		publishOptions?: TrackPublishOptions,
	): Promise<void> {
		assert.ok(nativeOptions);
		assert.ok(nativeOptions.source);
		if (guardScreenShareEntry({platformUnsupportedWarning: SCREEN_SHARE_UNSUPPORTED_PLATFORM_WARNING}) !== 'proceed') {
			return;
		}
		await this.assertNativeBridgeAvailable('desktop screen share capture');
		const nextOptions = await this.withAudioIfRequested(
			nativeOptions,
			this.shouldIncludeAudioFromSettings(nativeOptions.source.kind),
		);
		if (!nextOptions) throw new Error('Native screen-share audio unavailable');
		await this.startCapture(nextOptions, options, publishOptions);
	}

	private async releaseForSourceSwitch(): Promise<boolean> {
		if (this.activeCaptureId) {
			await this.releaseResources({
				reason: 'native-engine-screen-share-source-replaced',
				releaseStreamingPriority: false,
				preserveStreamStateOnUnpublish: true,
			});
			return true;
		}
		if (LocalVoiceState.getSelfStream()) {
			await this.stopCaptureDirect({
				sendUpdate: false,
				playSound: false,
				reason: 'native-engine-screen-share-source-replaced',
			});
			return true;
		}
		logger.warn('No active native-engine screen share to replace');
		return false;
	}

	private handleReplaceDisplayCaptureFailure(nativeOptions: NativeScreenShareOptions, error: unknown): void {
		assert.ok(nativeOptions);
		const isCancel = isUserCancelledOrPermissionDeniedError(error);
		if (isCancel) {
			logger.debug('User cancelled or denied native screen share source switch', {name: (error as Error).name});
		} else {
			logger.error('Failed to replace active native display screen share source', {
				error,
				sourceKind: nativeOptions.source.kind,
			});
		}
		const active = LocalVoiceState.getSelfStream();
		const sourceType = active ? this.adapter.getNativeScreenShareSourceType(nativeOptions) : null;
		this.adapter.transitionScreenShareLifecycleInternal(
			buildScreenShareFailureTransition({cancelled: isCancel, active, sourceType}),
		);
	}

	async replaceActiveDisplayCapture(
		_room: Room | null,
		nativeOptions: NativeScreenShareOptions,
		options?: ScreenShareCaptureOptions,
		publishOptions?: TrackPublishOptions,
	): Promise<boolean> {
		assert.ok(nativeOptions);
		assert.ok(nativeOptions.source);
		const entryVerdict = guardScreenShareEntry({
			platformUnsupportedWarning: SCREEN_SHARE_SOURCE_SWITCH_UNSUPPORTED_PLATFORM_WARNING,
			pending: {
				active: this.adapter.isScreenSharePending,
				debugMessage: 'Already pending, ignoring native screen share source switch',
			},
		});
		if (entryVerdict !== 'proceed') {
			return false;
		}
		await this.assertNativeBridgeAvailable('desktop screen share source switching');
		try {
			const proceed = await this.releaseForSourceSwitch();
			if (!proceed) return false;
			const nextOptions = await this.withAudioIfRequested(
				{
					...nativeOptions,
					resolution: nativeOptions.resolution ?? options?.resolution,
					contentHint: nativeOptions.contentHint ?? options?.contentHint,
				},
				this.shouldIncludeAudioFromSettings(nativeOptions.source.kind),
			);
			if (!nextOptions) throw new Error('Native screen-share audio unavailable');
			await this.startCapture(nextOptions, {sendUpdate: true, playSound: false}, publishOptions);
			return true;
		} catch (error) {
			this.handleReplaceDisplayCaptureFailure(nativeOptions, error);
			return false;
		}
	}

	async replaceActiveDeviceCapture(
		options?: DeviceScreenShareCaptureOptions,
		publishOptions?: TrackPublishOptions,
	): Promise<boolean> {
		assert.ok(options === undefined || typeof options === 'object');
		const entryVerdict = guardScreenShareEntry({
			platformUnsupportedWarning: SCREEN_SHARE_SOURCE_SWITCH_UNSUPPORTED_PLATFORM_WARNING,
			pending: {
				active: this.adapter.isScreenSharePending,
				debugMessage: 'Already pending, ignoring native device screen share source switch',
			},
		});
		if (entryVerdict !== 'proceed') {
			return false;
		}
		await this.assertNativeBridgeAvailable('device screen share source switching');
		if (!LocalVoiceState.getSelfStream()) {
			logger.warn('No active native-engine screen share to replace');
			return false;
		}
		try {
			await this.stopCaptureDirect({
				sendUpdate: false,
				playSound: false,
				reason: 'native-engine-device-screen-share-source-replaced',
			});
			await this.startDeviceCapture(options, {sendUpdate: true, playSound: false}, publishOptions);
			return LocalVoiceState.getSelfStream();
		} catch (error) {
			logger.error('Failed to replace active native device screen share source', {error});
			this.adapter.transitionScreenShareLifecycleInternal({
				type: 'share.reject',
				active: LocalVoiceState.getSelfStream(),
				sourceType: LocalVoiceState.getSelfStream() ? 'device' : null,
			});
			return false;
		}
	}

	async replaceActiveDisplayFromActiveSource(
		options?: ScreenShareCaptureOptions,
		publishOptions?: TrackPublishOptions,
	): Promise<boolean> {
		assert.ok(options === undefined || typeof options === 'object');
		const nativeOptions = await this.resolveOptionsFromActiveSource(options);
		if (!nativeOptions) {
			logger.warn('Native voice engine: no desktop source selected for screen-share source switch');
			return false;
		}
		return this.replaceActiveDisplayCapture(null, nativeOptions, options, publishOptions);
	}
}
