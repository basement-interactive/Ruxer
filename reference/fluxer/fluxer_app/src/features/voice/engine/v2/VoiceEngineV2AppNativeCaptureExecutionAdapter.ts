// SPDX-License-Identifier: AGPL-3.0-or-later

import {Logger} from '@app/features/platform/utils/AppLogger';
import type {
	NativeMediaPort,
	VoiceEngineV2NativeAudioTapOptions,
	VoiceEngineV2NativeCaptureOptions,
	VoiceEngineV2NativeFrameSinkOptions,
} from '@fluxer/voice_engine_v2';
import {
	assertVoiceEngineV2BridgeAudioOptionsInvariants,
	assertVoiceEngineV2BridgeVideoOptionsInvariants,
} from '@fluxer/voice_engine_v2/bridge';

export type VoiceEngineV2NativeMediaDiagnosticLevel = 'debug' | 'info' | 'warn' | 'error';

export interface VoiceEngineV2NativeMediaDiagnosticEvent {
	level: VoiceEngineV2NativeMediaDiagnosticLevel;
	code: string;
	captureId?: string;
	sinkId?: string;
	tapId?: string;
	detail?: unknown;
}

export interface ElectronNativeMediaStartResult {
	captureId: string;
	zeroCopyAvailable: boolean;
	fallback?: 'cpu-copy' | null;
}

export interface ElectronNativeMediaUpdateResult {
	captureId: string;
	zeroCopyAvailable: boolean;
	fallback?: 'cpu-copy' | null;
}

export interface ElectronNativeMediaAttachResult {
	sinkId: string;
	zeroCopyAvailable: boolean;
	fallback?: 'cpu-copy' | null;
}

export interface ElectronNativeMediaStartOptions extends VoiceEngineV2NativeCaptureOptions {
	zeroCopyRequired: true;
}

export interface ElectronNativeMediaAttachOptions {
	trackSid?: string;
	zeroCopyRequired: true;
}

export interface ElectronNativeMediaApi {
	start(options: ElectronNativeMediaStartOptions): Promise<ElectronNativeMediaStartResult>;
	update(options: ElectronNativeMediaStartOptions): Promise<ElectronNativeMediaUpdateResult>;
	stop(captureId: string): Promise<void>;
	startAudioTap?(options: VoiceEngineV2NativeAudioTapOptions): Promise<{tapId: string}>;
	stopAudioTap?(tapId: string): Promise<void>;
	attachSink(
		captureId: string,
		sinkId: string,
		options: ElectronNativeMediaAttachOptions,
	): Promise<ElectronNativeMediaAttachResult>;
	detachSink(sinkId: string): Promise<void>;
	isKnownCapture?(captureId: string): boolean;
}

export interface VoiceEngineV2AppNativeCaptureExecutionAdapterOptions {
	electronApi?: ElectronNativeMediaApi | null;
	getDiagnosticsEmit?: (event: VoiceEngineV2NativeMediaDiagnosticEvent) => void;
	logger?: Logger;
}

const ADAPTER_NAME = 'VoiceEngineV2AppNativeCaptureExecutionAdapter';
const ZERO_COPY_DIAGNOSTIC_CODE = 'zeroCopyUnavailable';
const AUDIO_TAP_NOT_SUPPORTED_CODE = 'audioTapNotSupported';
const ZERO_COPY_REQUIRED_FAILURE_REASON = 'zeroCopyRequired could not be satisfied';

function buildOperatingError(method: string, reason: string): Error {
	const error = new Error(`${ADAPTER_NAME}.${method}: ${reason}`);
	error.name = 'VoiceEngineV2AppNativeMediaOperatingError';
	return error;
}

function assertNonEmptyString(value: unknown, method: string, field: string): asserts value is string {
	if (typeof value !== 'string') {
		throw buildOperatingError(method, `${field} is not a string`);
	}
	if (value.length === 0) {
		throw buildOperatingError(method, `${field} must be a non-empty string`);
	}
}

function assertCaptureOptions(
	method: string,
	options: VoiceEngineV2NativeCaptureOptions | undefined | null,
): asserts options is VoiceEngineV2NativeCaptureOptions {
	if (typeof options !== 'object' || options === null) {
		throw buildOperatingError(method, 'options is not an object');
	}
	assertNonEmptyString(options.captureId, method, 'options.captureId');
	if (typeof options.source !== 'object' || options.source === null) {
		throw buildOperatingError(method, 'options.source is not an object');
	}
	assertNonEmptyString(options.source.id, method, 'options.source.id');
	if (typeof options.width !== 'number' || !Number.isFinite(options.width) || options.width <= 0) {
		throw buildOperatingError(method, 'options.width is not a positive number');
	}
	if (typeof options.height !== 'number' || !Number.isFinite(options.height) || options.height <= 0) {
		throw buildOperatingError(method, 'options.height is not a positive number');
	}
	if (typeof options.frameRate !== 'number' || !Number.isFinite(options.frameRate) || options.frameRate <= 0) {
		throw buildOperatingError(method, 'options.frameRate is not a positive number');
	}
	if (typeof options.includeCursor !== 'boolean') {
		throw buildOperatingError(method, 'options.includeCursor is not a boolean');
	}
	if (typeof options.includeAudio !== 'boolean') {
		throw buildOperatingError(method, 'options.includeAudio is not a boolean');
	}
}

function assertAudioTapOptions(
	method: string,
	options: VoiceEngineV2NativeAudioTapOptions | undefined | null,
): asserts options is VoiceEngineV2NativeAudioTapOptions {
	if (typeof options !== 'object' || options === null) {
		throw buildOperatingError(method, 'options is not an object');
	}
	assertNonEmptyString(options.tapId, method, 'options.tapId');
	switch (options.source) {
		case 'system':
		case 'application':
		case 'window':
			break;
		default: {
			throw buildOperatingError(method, 'options.source is not a known kind');
		}
	}
	if (typeof options.sampleRate !== 'number' || !Number.isFinite(options.sampleRate) || options.sampleRate <= 0) {
		throw buildOperatingError(method, 'options.sampleRate is not a positive number');
	}
	if (typeof options.numChannels !== 'number' || !Number.isFinite(options.numChannels) || options.numChannels <= 0) {
		throw buildOperatingError(method, 'options.numChannels is not a positive number');
	}
}

function assertFrameSinkOptions(
	method: string,
	options: VoiceEngineV2NativeFrameSinkOptions | undefined | null,
): asserts options is VoiceEngineV2NativeFrameSinkOptions {
	if (typeof options !== 'object' || options === null) {
		throw buildOperatingError(method, 'options is not an object');
	}
	assertNonEmptyString(options.sinkId, method, 'options.sinkId');
	assertNonEmptyString(options.captureId, method, 'options.captureId');
	if (options.trackSid !== undefined && (typeof options.trackSid !== 'string' || options.trackSid.length === 0)) {
		throw buildOperatingError(method, 'options.trackSid must be a non-empty string when provided');
	}
}

function isZeroCopyFallback(result: {zeroCopyAvailable: boolean; fallback?: 'cpu-copy' | null}): boolean {
	if (result.zeroCopyAvailable === false) return true;
	if (result.fallback === 'cpu-copy') return true;
	return false;
}

export class VoiceEngineV2AppNativeCaptureExecutionAdapter implements NativeMediaPort {
	private readonly electronApi: ElectronNativeMediaApi | null;
	private readonly emitDiagnostic: (event: VoiceEngineV2NativeMediaDiagnosticEvent) => void;
	private readonly logger: Logger;
	private readonly knownCaptures: Set<string>;
	private readonly knownSinks: Map<string, string>;
	private readonly knownTaps: Set<string>;

	constructor(options: VoiceEngineV2AppNativeCaptureExecutionAdapterOptions = {}) {
		const electronApi = options.electronApi ?? null;
		if (electronApi !== null && typeof electronApi !== 'object') {
			throw new Error(`${ADAPTER_NAME}: electronApi must be an object when provided`);
		}
		this.electronApi = electronApi;
		this.emitDiagnostic = options.getDiagnosticsEmit ?? (() => undefined);
		this.logger = options.logger ?? new Logger(ADAPTER_NAME);
		this.knownCaptures = new Set();
		this.knownSinks = new Map();
		this.knownTaps = new Set();
	}

	async startCapture(options: VoiceEngineV2NativeCaptureOptions): Promise<void> {
		assertCaptureOptions('startCapture', options);
		assertVoiceEngineV2BridgeVideoOptionsInvariants({width: options.width, height: options.height});
		const api = this.electronApi;
		if (api === null) {
			throw buildOperatingError('startCapture', 'electronApi is unavailable');
		}
		const result = await this.invoke('startCapture', () => api.start({...options, zeroCopyRequired: true}));
		if (typeof result !== 'object' || result === null) {
			throw buildOperatingError('startCapture', 'electronApi.start returned a non-object');
		}
		assertNonEmptyString(result.captureId, 'startCapture', 'result.captureId');
		if (result.captureId !== options.captureId) {
			throw buildOperatingError('startCapture', 'result.captureId does not match the requested captureId');
		}
		if (isZeroCopyFallback(result)) {
			this.emitZeroCopyFallback({captureId: result.captureId});
			await this.stopStartedZeroCopyFallback(api, result.captureId, 'startCapture');
			throw buildOperatingError('startCapture', ZERO_COPY_REQUIRED_FAILURE_REASON);
		}
		this.knownCaptures.add(result.captureId);
	}

	async updateCapture(options: VoiceEngineV2NativeCaptureOptions): Promise<void> {
		assertCaptureOptions('updateCapture', options);
		assertVoiceEngineV2BridgeVideoOptionsInvariants({width: options.width, height: options.height});
		const api = this.electronApi;
		if (api === null) {
			throw buildOperatingError('updateCapture', 'electronApi is unavailable');
		}
		if (!this.isCaptureKnown(options.captureId)) {
			throw buildOperatingError('updateCapture', 'captureId is not known');
		}
		const result = await this.invoke('updateCapture', () => api.update({...options, zeroCopyRequired: true}));
		if (typeof result !== 'object' || result === null) {
			throw buildOperatingError('updateCapture', 'electronApi.update returned a non-object');
		}
		assertNonEmptyString(result.captureId, 'updateCapture', 'result.captureId');
		if (result.captureId !== options.captureId) {
			throw buildOperatingError('updateCapture', 'result.captureId does not match the requested captureId');
		}
		if (isZeroCopyFallback(result)) {
			this.emitZeroCopyFallback({captureId: result.captureId});
			await this.stopStartedZeroCopyFallback(api, result.captureId, 'updateCapture');
			this.knownCaptures.delete(result.captureId);
			this.releaseSinksForCapture(result.captureId);
			throw buildOperatingError('updateCapture', ZERO_COPY_REQUIRED_FAILURE_REASON);
		}
	}

	async stopCapture(captureId: string): Promise<void> {
		assertNonEmptyString(captureId, 'stopCapture', 'captureId');
		const api = this.electronApi;
		if (api === null) {
			throw buildOperatingError('stopCapture', 'electronApi is unavailable');
		}
		if (!this.isCaptureKnown(captureId)) {
			throw buildOperatingError('stopCapture', 'captureId is not known');
		}
		await this.invoke('stopCapture', () => api.stop(captureId));
		this.knownCaptures.delete(captureId);
		this.releaseSinksForCapture(captureId);
	}

	async startAudioTap(options: VoiceEngineV2NativeAudioTapOptions): Promise<void> {
		assertAudioTapOptions('startAudioTap', options);
		assertVoiceEngineV2BridgeAudioOptionsInvariants({
			sampleRate: options.sampleRate,
			numChannels: options.numChannels,
		});
		const api = this.electronApi;
		if (api === null) {
			throw buildOperatingError('startAudioTap', 'electronApi is unavailable');
		}
		if (typeof api.startAudioTap !== 'function') {
			throw buildOperatingError('startAudioTap', AUDIO_TAP_NOT_SUPPORTED_CODE);
		}
		const result = await this.invoke('startAudioTap', () => api.startAudioTap!(options));
		if (typeof result !== 'object' || result === null) {
			throw buildOperatingError('startAudioTap', 'electronApi.startAudioTap returned a non-object');
		}
		assertNonEmptyString(result.tapId, 'startAudioTap', 'result.tapId');
		if (result.tapId !== options.tapId) {
			throw buildOperatingError('startAudioTap', 'result.tapId does not match the requested tapId');
		}
		this.knownTaps.add(result.tapId);
	}

	async stopAudioTap(tapId: string): Promise<void> {
		assertNonEmptyString(tapId, 'stopAudioTap', 'tapId');
		const api = this.electronApi;
		if (api === null) {
			throw buildOperatingError('stopAudioTap', 'electronApi is unavailable');
		}
		if (typeof api.stopAudioTap !== 'function') {
			throw buildOperatingError('stopAudioTap', AUDIO_TAP_NOT_SUPPORTED_CODE);
		}
		if (!this.knownTaps.has(tapId)) {
			throw buildOperatingError('stopAudioTap', 'tapId is not known');
		}
		await this.invoke('stopAudioTap', () => api.stopAudioTap!(tapId));
		this.knownTaps.delete(tapId);
	}

	async attachFrameSink(options: VoiceEngineV2NativeFrameSinkOptions): Promise<void> {
		assertFrameSinkOptions('attachFrameSink', options);
		const api = this.electronApi;
		if (api === null) {
			throw buildOperatingError('attachFrameSink', 'electronApi is unavailable');
		}
		if (!this.isCaptureKnown(options.captureId)) {
			throw buildOperatingError('attachFrameSink', 'captureId is not known');
		}
		const result = await this.invoke('attachFrameSink', () =>
			api.attachSink(options.captureId, options.sinkId, {
				trackSid: options.trackSid,
				zeroCopyRequired: true,
			}),
		);
		if (typeof result !== 'object' || result === null) {
			throw buildOperatingError('attachFrameSink', 'electronApi.attachSink returned a non-object');
		}
		assertNonEmptyString(result.sinkId, 'attachFrameSink', 'result.sinkId');
		if (result.sinkId !== options.sinkId) {
			throw buildOperatingError('attachFrameSink', 'result.sinkId does not match the requested sinkId');
		}
		if (isZeroCopyFallback(result)) {
			this.emitZeroCopyFallback({captureId: options.captureId, sinkId: result.sinkId});
			await this.detachAttachedZeroCopyFallback(api, result.sinkId, 'attachFrameSink');
			throw buildOperatingError('attachFrameSink', ZERO_COPY_REQUIRED_FAILURE_REASON);
		}
		this.knownSinks.set(result.sinkId, options.captureId);
	}

	async detachFrameSink(sinkId: string): Promise<void> {
		assertNonEmptyString(sinkId, 'detachFrameSink', 'sinkId');
		const api = this.electronApi;
		if (api === null) {
			throw buildOperatingError('detachFrameSink', 'electronApi is unavailable');
		}
		if (!this.knownSinks.has(sinkId)) {
			throw buildOperatingError('detachFrameSink', 'sinkId is not known');
		}
		await this.invoke('detachFrameSink', () => api.detachSink(sinkId));
		this.knownSinks.delete(sinkId);
	}

	private isCaptureKnown(captureId: string): boolean {
		if (this.knownCaptures.has(captureId)) return true;
		const api = this.electronApi;
		if (api === null) return false;
		if (typeof api.isKnownCapture !== 'function') return false;
		return api.isKnownCapture(captureId) === true;
	}

	private releaseSinksForCapture(captureId: string): void {
		const toRelease: Array<string> = [];
		for (const [sinkId, owner] of this.knownSinks) {
			if (owner === captureId) toRelease.push(sinkId);
		}
		for (const sinkId of toRelease) {
			this.knownSinks.delete(sinkId);
		}
	}

	private emitZeroCopyFallback(target: {captureId: string; sinkId?: string}): void {
		this.logger.warn('zero-copy unavailable, falling back to CPU copy', target);
		this.emitDiagnostic({
			level: 'warn',
			code: ZERO_COPY_DIAGNOSTIC_CODE,
			captureId: target.captureId,
			sinkId: target.sinkId,
		});
	}

	private async stopStartedZeroCopyFallback(
		api: ElectronNativeMediaApi,
		captureId: string,
		method: string,
	): Promise<void> {
		assertNonEmptyString(captureId, method, 'captureId');
		await this.invoke(`${method}.stopFallbackCapture`, () => api.stop(captureId)).catch((error) => {
			this.logger.warn('Failed to stop native capture after zero-copy fallback', {captureId, method, error});
		});
	}

	private async detachAttachedZeroCopyFallback(
		api: ElectronNativeMediaApi,
		sinkId: string,
		method: string,
	): Promise<void> {
		assertNonEmptyString(sinkId, method, 'sinkId');
		await this.invoke(`${method}.detachFallbackSink`, () => api.detachSink(sinkId)).catch((error) => {
			this.logger.warn('Failed to detach native frame sink after zero-copy fallback', {sinkId, method, error});
		});
	}

	private async invoke<T>(method: string, body: () => Promise<T> | T): Promise<T> {
		try {
			return await Promise.resolve(body());
		} catch (error) {
			this.logger.warn(`${method} delegate threw`, {error});
			if (error instanceof Error) throw error;
			throw buildOperatingError(method, typeof error === 'string' ? error : 'delegate failed');
		}
	}
}
