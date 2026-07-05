// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0
import {EventEmitter} from 'events';
import type TypedEventEmitter from 'typed-emitter';
import {workerLogger} from '../../logger.ts';
import type {VideoCodec} from '../../room/track/options.ts';
import {ENCRYPTION_ALGORITHM, IV_LENGTH, UNENCRYPTED_BYTES} from '../constants.ts';
import {CryptorError, CryptorErrorReason} from '../errors.ts';
import {type CryptorCallbacks, CryptorEvent} from '../events.ts';
import type {DecodeRatchetOptions, KeyProviderOptions, KeySet, RatchetResult} from '../types.ts';
import {deriveKeys, isVideoFrame, needsRbspUnescaping, parseRbsp, writeRbsp} from '../utils.ts';
import {
	type Av1E2eeMetadata,
	buildAv1E2eeMetadataObu,
	computeAv1EncryptionLayout,
	extractAv1E2eeMetadataObu,
	GCM_TAG_LENGTH_BYTES,
} from './av1Utils.ts';
import {processNALUsForEncryption} from './naluUtils.ts';
import type {ParticipantKeyHandler} from './ParticipantKeyHandler.ts';
import {identifySifPayload} from './sifPayload.ts';

export const encryptionEnabledMap: Map<string, boolean> = new Map();
const FRAME_TRAILER_LENGTH = 2;

export interface EncryptedFrameLayout {
	frameHeaderLength: number;
	ivLength: number;
	ivStart: number;
	cipherTextStart: number;
	cipherTextLength: number;
	keyIndex: number;
}

export function getFrameHeaderLength(unencryptedBytes: number, frameDataLength: number): number {
	if (!Number.isFinite(unencryptedBytes) || unencryptedBytes <= 0) return 0;
	return Math.min(Math.trunc(unencryptedBytes), frameDataLength);
}

export function getEncryptedFrameLayout(
	frameData: ArrayBufferLike,
	frameHeaderLength: number,
): EncryptedFrameLayout | undefined {
	const dataLength = frameData.byteLength;
	const encryptedOverheadLength = FRAME_TRAILER_LENGTH + IV_LENGTH + GCM_TAG_LENGTH_BYTES;
	const maxHeaderLength = Math.max(0, dataLength - encryptedOverheadLength);
	const safeHeaderLength = Math.min(getFrameHeaderLength(frameHeaderLength, dataLength), maxHeaderLength);
	if (dataLength < safeHeaderLength + encryptedOverheadLength) return undefined;
	const trailerStart = dataLength - FRAME_TRAILER_LENGTH;
	const frameTrailer = new Uint8Array(frameData, trailerStart, FRAME_TRAILER_LENGTH);
	const ivLength = frameTrailer[0];
	const keyIndex = frameTrailer[1];
	if (ivLength !== IV_LENGTH) return undefined;
	const ivStart = trailerStart - ivLength;
	if (ivStart < safeHeaderLength) return undefined;
	const cipherTextStart = safeHeaderLength;
	const cipherTextLength = ivStart - cipherTextStart;
	if (cipherTextLength < GCM_TAG_LENGTH_BYTES) return undefined;
	return {frameHeaderLength: safeHeaderLength, ivLength, ivStart, cipherTextStart, cipherTextLength, keyIndex};
}

export interface FrameCryptorConstructor {
	new (opts?: unknown): BaseFrameCryptor;
}

export interface TransformerInfo {
	readable: ReadableStream;
	writable: WritableStream;
	transformer: TransformStream;
	trackId: string;
	symbol: symbol;
}

type EncodedFrame = RTCEncodedVideoFrame | RTCEncodedAudioFrame;

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export class BaseFrameCryptor extends (EventEmitter as new () => TypedEventEmitter<CryptorCallbacks>) {
	protected encodeFunction(_encodedFrame: EncodedFrame, _controller: TransformStreamDefaultController): Promise<void> {
		throw Error('not implemented for subclass');
	}

	protected decodeFunction(_encodedFrame: EncodedFrame, _controller: TransformStreamDefaultController): Promise<void> {
		throw Error('not implemented for subclass');
	}
}

export class FrameCryptor extends BaseFrameCryptor {
	private sendCounts: Map<number, number>;
	private av1LayoutFailureLogged: boolean = false;
	private participantIdentity: string | undefined;
	private trackId: string | undefined;
	private keys: ParticipantKeyHandler;
	private videoCodec?: VideoCodec;
	private rtpMap: Map<number, VideoCodec>;
	private keyProviderOptions: KeyProviderOptions;
	private sifTrailer: Uint8Array;
	private detectedCodec?: VideoCodec;
	private currentTransform?: TransformerInfo;
	private lastErrorTimestamp: Map<string, number> = new Map();
	private errorCounts: Map<string, number> = new Map();
	private readonly ERROR_THROTTLE_MS = 1000;
	private readonly MAX_ERRORS_PER_MINUTE = 5;
	private readonly ERROR_WINDOW_MS = 60000;
	private readonly encodeTrailer: Uint8Array = new Uint8Array(2);

	constructor(opts: {
		keys: ParticipantKeyHandler;
		participantIdentity: string;
		keyProviderOptions: KeyProviderOptions;
		sifTrailer?: Uint8Array;
	}) {
		super();
		this.sendCounts = new Map();
		this.keys = opts.keys;
		this.participantIdentity = opts.participantIdentity;
		this.rtpMap = new Map();
		this.keyProviderOptions = opts.keyProviderOptions;
		this.sifTrailer = opts.sifTrailer ?? Uint8Array.from([]);
	}

	private get logContext() {
		return {
			participant: this.participantIdentity,
			mediaTrackId: this.trackId,
			fallbackCodec: this.videoCodec,
		};
	}

	setParticipant(id: string, keys: ParticipantKeyHandler) {
		workerLogger.debug('setting new participant on cryptor', {
			...this.logContext,
			newParticipant: id,
			hadPreviousParticipant: !!this.participantIdentity,
		});
		if (this.participantIdentity && this.participantIdentity !== id) {
			workerLogger.warn('cryptor has already a participant set, cleaning up before switching', {
				oldParticipant: this.participantIdentity,
				newParticipant: id,
				trackId: this.trackId,
			});
			this.unsetParticipant();
		}
		this.participantIdentity = id;
		this.keys = keys;
	}

	unsetParticipant() {
		workerLogger.debug('unsetting participant', this.logContext);
		if (this.currentTransform) {
			this.currentTransform = undefined;
		}
		this.participantIdentity = undefined;
		this.videoCodec = undefined;
		this.resetCodecState();
		this.lastErrorTimestamp = new Map();
		this.errorCounts = new Map();
	}

	isEnabled() {
		if (this.participantIdentity) {
			return encryptionEnabledMap.get(this.participantIdentity);
		} else {
			return undefined;
		}
	}

	getParticipantIdentity() {
		return this.participantIdentity;
	}

	getTrackId() {
		return this.trackId;
	}

	updateTrackContext(trackId: string, codec?: VideoCodec) {
		const trackChanged = this.trackId !== trackId;
		if (trackChanged) {
			workerLogger.debug('updating track context on cryptor', {
				...this.logContext,
				oldTrackId: this.trackId,
				newTrackId: trackId,
			});
			this.trackId = trackId;
			this.resetCodecState();
			if (!codec) {
				this.videoCodec = undefined;
			}
		}
		if (codec) {
			this.setVideoCodec(codec);
		}
	}

	setVideoCodec(codec: VideoCodec) {
		if (this.videoCodec !== codec) {
			this.resetCodecState();
		}
		this.videoCodec = codec;
	}

	setRtpMap(map: Map<number, VideoCodec>) {
		this.rtpMap = map;
	}

	setupTransform(
		operation: 'encode' | 'decode',
		readable: ReadableStream<RTCEncodedVideoFrame | RTCEncodedAudioFrame>,
		writable: WritableStream<RTCEncodedVideoFrame | RTCEncodedAudioFrame>,
		trackId: string,
		isReuse: boolean,
		codec?: VideoCodec,
	) {
		this.updateTrackContext(trackId, codec);
		workerLogger.debug('Setting up frame cryptor transform', {
			operation,
			passedTrackId: trackId,
			codec,
			isReuse,
			hasCurrentTransform: !!this.currentTransform,
			...this.logContext,
		});
		if (
			isReuse &&
			this.currentTransform &&
			readable === this.currentTransform.readable &&
			writable === this.currentTransform.writable
		) {
			workerLogger.debug('reusing existing transform', {
				...this.logContext,
				trackId,
			});
			return;
		}
		const symbol = Symbol('transform');
		const transformFn = operation === 'encode' ? this.encodeFunction : this.decodeFunction;
		const transformStream = new TransformStream({
			transform: transformFn.bind(this),
		});
		this.currentTransform = {
			readable,
			writable,
			transformer: transformStream,
			trackId,
			symbol,
		};
		readable
			.pipeThrough(transformStream)
			.pipeTo(writable)
			.catch((e) => {
				if (e instanceof TypeError && e.message === 'Destination stream closed') {
					workerLogger.debug('destination stream closed');
				} else {
					workerLogger.warn('transform error', {error: e, ...this.logContext});
					this.emit(
						CryptorEvent.Error,
						e instanceof CryptorError ? e : new CryptorError(e.message, undefined, this.participantIdentity),
					);
				}
			})
			.finally(() => {
				if (this.currentTransform?.symbol === symbol) {
					workerLogger.debug('transform completed', {
						...this.logContext,
						trackId,
					});
					this.currentTransform = undefined;
				}
			});
	}

	setSifTrailer(trailer: Uint8Array) {
		workerLogger.debug('setting SIF trailer', {...this.logContext, trailer});
		this.sifTrailer = trailer;
	}

	private shouldEmitError(errorKey: string): boolean {
		const now = Date.now();
		const lastErrorTime = this.lastErrorTimestamp.get(errorKey) ?? 0;
		const errorCount = this.errorCounts.get(errorKey) ?? 0;
		if (now - lastErrorTime > this.ERROR_WINDOW_MS) {
			this.errorCounts.set(errorKey, 0);
			this.lastErrorTimestamp.set(errorKey, now);
			return true;
		}
		if (now - lastErrorTime < this.ERROR_THROTTLE_MS) {
			return false;
		}
		if (errorCount >= this.MAX_ERRORS_PER_MINUTE) {
			if (errorCount === this.MAX_ERRORS_PER_MINUTE) {
				workerLogger.warn(`Suppressing further decryption errors for ${this.participantIdentity}`, {
					...this.logContext,
					errorKey,
				});
				this.errorCounts.set(errorKey, errorCount + 1);
			}
			return false;
		}
		this.lastErrorTimestamp.set(errorKey, now);
		this.errorCounts.set(errorKey, errorCount + 1);
		return true;
	}

	private emitThrottledError(error: CryptorError) {
		const errorKey = `${this.participantIdentity}-${error.reason}-decrypt`;
		if (this.shouldEmitError(errorKey)) {
			const errorCount = this.errorCounts.get(errorKey) ?? 0;
			if (errorCount > 1) {
				workerLogger.debug(`Decryption error (${errorCount} occurrences in window)`, {
					...this.logContext,
					reason: CryptorErrorReason[error.reason],
				});
			}
			this.emit(CryptorEvent.Error, error);
		}
	}

	private resetCodecState() {
		this.detectedCodec = undefined;
		this.av1LayoutFailureLogged = false;
	}

	protected async encodeFunction(
		encodedFrame: EncodedFrame,
		controller: TransformStreamDefaultController,
	): Promise<void> {
		if (encodedFrame.data.byteLength === 0) {
			controller.enqueue(encodedFrame);
			return undefined;
		}
		const encryptionEnabled = this.isEnabled();
		if (encryptionEnabled === false) {
			controller.enqueue(encodedFrame);
			return undefined;
		}
		if (encryptionEnabled !== true) {
			return;
		}
		const keySet = this.keys.getKeySet();
		if (!keySet) {
			this.emitThrottledError(
				new CryptorError(
					`key set not found for ${this.participantIdentity} at index ${this.keys.getCurrentKeyIndex()}`,
					CryptorErrorReason.MissingKey,
					this.participantIdentity,
				),
			);
			return;
		}
		const {encryptionKey} = keySet;
		const keyIndex = this.keys.getCurrentKeyIndex();
		if (encryptionKey) {
			const iv = this.makeIV(encodedFrame.getMetadata().synchronizationSource ?? -1, encodedFrame.timestamp);
			const frameInfo = this.getUnencryptedBytes(encodedFrame);
			if (isVideoFrame(encodedFrame) && this.detectedCodec === 'av1') {
				const plainPayload = new Uint8Array(encodedFrame.data);
				const layout = computeAv1EncryptionLayout(plainPayload);
				if (!layout) {
					const debugInfo = this.av1LayoutFailureLogged
						? undefined
						: {
								length: plainPayload.byteLength,
								firstByte: plainPayload[0],
								looksLikeRtpAggregationHeader: (plainPayload[0] & 0x07) === 0,
								looksLikeObuHeader: (plainPayload[0] & 0x80) === 0 && (plainPayload[0] & 0x01) === 0,
							};
					this.av1LayoutFailureLogged = true;
					workerLogger.warn('AV1 E2EE could not determine encryption layout, dropping frame', {
						...this.logContext,
						...(debugInfo ? {debugInfo} : {}),
					});
					this.emitThrottledError(
						new CryptorError(
							`unable to encrypt AV1 frame: layout detection failed`,
							CryptorErrorReason.InternalError,
							this.participantIdentity,
						),
					);
					return;
				}
				try {
					const plainProtected = layout.extractProtected(plainPayload);
					const cipherProtectedWithTag = new Uint8Array(
						await crypto.subtle.encrypt(
							{
								name: ENCRYPTION_ALGORITHM,
								iv,
								additionalData: layout.buildAAD(plainPayload) as BufferSource,
							},
							encryptionKey,
							plainProtected as BufferSource,
						),
					);
					if (cipherProtectedWithTag.byteLength !== plainProtected.byteLength + GCM_TAG_LENGTH_BYTES) {
						throw new Error(
							`Unexpected AES-GCM output length: got ${cipherProtectedWithTag.byteLength}, expected ${
								plainProtected.byteLength + GCM_TAG_LENGTH_BYTES
							}`,
						);
					}
					const cipherProtected = cipherProtectedWithTag.subarray(0, plainProtected.byteLength);
					const tag = cipherProtectedWithTag.subarray(plainProtected.byteLength);
					const metadataObu = buildAv1E2eeMetadataObu({
						keyIndex,
						iv: new Uint8Array(iv),
						tag,
					});
					const newPayload = new Uint8Array(plainPayload.byteLength + metadataObu.byteLength);
					newPayload.set(plainPayload);
					layout.writeProtected(newPayload, cipherProtected);
					newPayload.set(metadataObu, plainPayload.byteLength);
					encodedFrame.data = newPayload.buffer;
					controller.enqueue(encodedFrame);
					return undefined;
				} catch (e: unknown) {
					const errorMessage = getErrorMessage(e);
					workerLogger.error('AV1 E2EE encryption failed, dropping frame', {
						error: e,
						errorName: e instanceof Error ? e.name : undefined,
						errorMessage,
						...this.logContext,
					});
					this.emitThrottledError(
						new CryptorError(
							`unable to encrypt AV1 frame: ${errorMessage}`,
							CryptorErrorReason.InternalError,
							this.participantIdentity,
						),
					);
					return;
				}
			}
			const frameHeaderLength = getFrameHeaderLength(frameInfo.unencryptedBytes, encodedFrame.data.byteLength);
			const frameHeader = new Uint8Array(encodedFrame.data, 0, frameHeaderLength);
			const frameTrailer = this.encodeTrailer;
			frameTrailer[0] = IV_LENGTH;
			frameTrailer[1] = keyIndex;
			try {
				const cipherText = await crypto.subtle.encrypt(
					{
						name: ENCRYPTION_ALGORITHM,
						iv,
						additionalData: frameHeader,
					},
					encryptionKey,
					new Uint8Array(encodedFrame.data, frameHeaderLength),
				);
				const cipherView = new Uint8Array(cipherText);
				const ivView = new Uint8Array(iv);
				let newDataWithoutHeader: Uint8Array = new Uint8Array(
					cipherText.byteLength + iv.byteLength + frameTrailer.byteLength,
				);
				newDataWithoutHeader.set(cipherView);
				newDataWithoutHeader.set(ivView, cipherText.byteLength);
				newDataWithoutHeader.set(frameTrailer, cipherText.byteLength + iv.byteLength);
				if (frameInfo.requiresNALUProcessing) {
					newDataWithoutHeader = writeRbsp(newDataWithoutHeader);
				}
				const newData = new Uint8Array(frameHeader.byteLength + newDataWithoutHeader.byteLength);
				newData.set(frameHeader);
				newData.set(newDataWithoutHeader, frameHeader.byteLength);
				encodedFrame.data = newData.buffer;
				controller.enqueue(encodedFrame);
				return undefined;
			} catch (e: unknown) {
				workerLogger.error(e);
			}
		} else {
			workerLogger.debug('failed to encrypt, emitting error', this.logContext);
			this.emitThrottledError(
				new CryptorError(
					`encryption key missing for encoding`,
					CryptorErrorReason.MissingKey,
					this.participantIdentity,
				),
			);
		}
	}

	protected async decodeFunction(
		encodedFrame: EncodedFrame,
		controller: TransformStreamDefaultController,
	): Promise<void> {
		if (encodedFrame.data.byteLength === 0) {
			controller.enqueue(encodedFrame);
			return undefined;
		}
		const encryptionEnabled = this.isEnabled();
		if (encryptionEnabled === false) {
			controller.enqueue(encodedFrame);
			return undefined;
		}
		if (encryptionEnabled !== true) {
			return;
		}
		if (isFrameServerInjected(encodedFrame.data, this.sifTrailer)) {
			encodedFrame.data = encodedFrame.data.slice(0, encodedFrame.data.byteLength - this.sifTrailer.byteLength);
			if (await identifySifPayload(encodedFrame.data)) {
				workerLogger.debug('enqueue SIF', this.logContext);
				controller.enqueue(encodedFrame);
				return undefined;
			} else {
				workerLogger.warn('Unexpected SIF frame payload, dropping frame', this.logContext);
				return;
			}
		}
		const data = new Uint8Array(encodedFrame.data);
		const extractedAv1 = isVideoFrame(encodedFrame) ? extractAv1E2eeMetadataObu(data) : undefined;
		let keyIndex: number;
		let av1Payload: Uint8Array | undefined;
		let av1Meta: Av1E2eeMetadata | undefined;
		if (extractedAv1) {
			keyIndex = extractedAv1.meta.keyIndex;
			av1Payload = extractedAv1.payload;
			av1Meta = extractedAv1.meta;
			if (this.detectedCodec !== 'av1') {
				this.detectedCodec = 'av1';
			}
		} else {
			keyIndex = data[encodedFrame.data.byteLength - 1];
		}
		if (this.keys.hasInvalidKeyAtIndex(keyIndex)) {
			return;
		}
		if (this.keys.getKeySet(keyIndex)) {
			try {
				const decodedFrame = await this.decryptFrame(
					encodedFrame,
					keyIndex,
					undefined,
					{ratchetCount: 0},
					extractedAv1 ? {payload: av1Payload, meta: av1Meta} : undefined,
				);
				this.keys.decryptionSuccess(keyIndex);
				if (decodedFrame) {
					controller.enqueue(decodedFrame);
					return undefined;
				}
			} catch (error) {
				if (error instanceof CryptorError && error.reason === CryptorErrorReason.InvalidKey) {
					if (this.keys.hasValidKey) {
						this.emitThrottledError(error);
						this.keys.decryptionFailure(keyIndex);
					}
				} else if (error instanceof CryptorError && error.reason === CryptorErrorReason.InternalError) {
					workerLogger.warn('dropping malformed encrypted frame', {error, ...this.logContext});
					this.emitThrottledError(error);
				} else {
					workerLogger.warn('decoding frame failed', {error});
				}
			}
		} else {
			workerLogger.warn(`skipping decryption due to missing key at index ${keyIndex}`);
			this.emitThrottledError(
				new CryptorError(
					`missing key at index ${keyIndex} for participant ${this.participantIdentity}`,
					CryptorErrorReason.MissingKey,
					this.participantIdentity,
				),
			);
			this.keys.decryptionFailure(keyIndex);
		}
	}

	private async decryptFrame(
		encodedFrame: RTCEncodedVideoFrame | RTCEncodedAudioFrame,
		keyIndex: number,
		initialMaterial: KeySet | undefined = undefined,
		ratchetOpts: DecodeRatchetOptions = {ratchetCount: 0},
		av1?: {payload?: Uint8Array; meta?: Av1E2eeMetadata},
	): Promise<RTCEncodedVideoFrame | RTCEncodedAudioFrame | undefined> {
		const keySet = this.keys.getKeySet(keyIndex);
		if (!ratchetOpts.encryptionKey && !keySet) {
			throw new TypeError(`no encryption key found for decryption of ${this.participantIdentity}`);
		}
		const frameInfo = this.getUnencryptedBytes(encodedFrame);
		try {
			if (isVideoFrame(encodedFrame) && av1?.payload && av1.meta) {
				const {payload, meta} = av1 as {payload: Uint8Array; meta: Av1E2eeMetadata};
				if (meta.keyIndex !== keyIndex) {
					throw new Error(`AV1 key index mismatch (meta=${meta.keyIndex}, expected=${keyIndex})`);
				}
				const layout = computeAv1EncryptionLayout(payload);
				if (!layout) {
					throw new Error('AV1 layout detection failed during decryption');
				}
				const cipherProtected = layout.extractProtected(payload);
				const cipherProtectedWithTag = new Uint8Array(cipherProtected.byteLength + meta.tag.byteLength);
				cipherProtectedWithTag.set(cipherProtected);
				cipherProtectedWithTag.set(meta.tag, cipherProtected.byteLength);
				const plainProtected = new Uint8Array(
					await crypto.subtle.decrypt(
						{
							name: ENCRYPTION_ALGORITHM,
							iv: meta.iv as BufferSource,
							additionalData: layout.buildAAD(payload) as BufferSource,
						},
						ratchetOpts.encryptionKey ?? keySet!.encryptionKey,
						cipherProtectedWithTag,
					),
				);
				const newPayload = new Uint8Array(payload.byteLength);
				newPayload.set(payload);
				layout.writeProtected(newPayload, plainProtected);
				encodedFrame.data = newPayload.buffer;
				return encodedFrame;
			}
			const frameHeaderLength = getFrameHeaderLength(frameInfo.unencryptedBytes, encodedFrame.data.byteLength);
			let frameHeader = new Uint8Array(encodedFrame.data, 0, frameHeaderLength);
			let encryptedData: Uint8Array = new Uint8Array(
				encodedFrame.data,
				frameHeader.length,
				encodedFrame.data.byteLength - frameHeader.length,
			);
			if (frameInfo.requiresNALUProcessing && needsRbspUnescaping(encryptedData)) {
				encryptedData = parseRbsp(encryptedData);
				const newUint8 = new Uint8Array(frameHeader.byteLength + encryptedData.byteLength);
				newUint8.set(frameHeader);
				newUint8.set(encryptedData, frameHeader.byteLength);
				encodedFrame.data = newUint8.buffer;
			}
			const encryptedFrameLayout = getEncryptedFrameLayout(encodedFrame.data, frameHeader.byteLength);
			if (!encryptedFrameLayout) {
				throw new CryptorError(
					`invalid encrypted frame layout for participant ${this.participantIdentity}`,
					CryptorErrorReason.InternalError,
					this.participantIdentity,
				);
			}
			frameHeader = new Uint8Array(encodedFrame.data, 0, encryptedFrameLayout.frameHeaderLength);
			const iv = new Uint8Array(encodedFrame.data, encryptedFrameLayout.ivStart, encryptedFrameLayout.ivLength);
			const plainText = await crypto.subtle.decrypt(
				{
					name: ENCRYPTION_ALGORITHM,
					iv,
					additionalData: frameHeader,
				},
				ratchetOpts.encryptionKey ?? keySet!.encryptionKey,
				new Uint8Array(encodedFrame.data, encryptedFrameLayout.cipherTextStart, encryptedFrameLayout.cipherTextLength),
			);
			const newData = new ArrayBuffer(frameHeader.byteLength + plainText.byteLength);
			const newUint8 = new Uint8Array(newData);
			newUint8.set(frameHeader);
			newUint8.set(new Uint8Array(plainText), frameHeader.byteLength);
			encodedFrame.data = newData;
			return encodedFrame;
		} catch (error: unknown) {
			if (error instanceof CryptorError && error.reason === CryptorErrorReason.InternalError) {
				throw error;
			}
			if (this.keyProviderOptions.ratchetWindowSize > 0) {
				if (ratchetOpts.ratchetCount < this.keyProviderOptions.ratchetWindowSize) {
					workerLogger.debug(
						`ratcheting key attempt ${ratchetOpts.ratchetCount} of ${
							this.keyProviderOptions.ratchetWindowSize
						}, for kind ${isVideoFrame(encodedFrame) ? 'video' : 'audio'}`,
					);
					let ratchetedKeySet: KeySet | undefined;
					let ratchetResult: RatchetResult | undefined;
					if ((initialMaterial ?? keySet) === this.keys.getKeySet(keyIndex)) {
						ratchetResult = await this.keys.ratchetKey(keyIndex, false);
						ratchetedKeySet = await deriveKeys(ratchetResult.cryptoKey, this.keyProviderOptions.ratchetSalt);
					}
					const frame = await this.decryptFrame(
						encodedFrame,
						keyIndex,
						initialMaterial || keySet,
						{
							ratchetCount: ratchetOpts.ratchetCount + 1,
							encryptionKey: ratchetedKeySet?.encryptionKey,
						},
						av1,
					);
					if (frame && ratchetedKeySet) {
						if ((initialMaterial ?? keySet) === this.keys.getKeySet(keyIndex)) {
							this.keys.setKeySet(ratchetedKeySet, keyIndex, ratchetResult);
							this.keys.setCurrentKeyIndex(keyIndex);
						}
					}
					return frame;
				} else {
					workerLogger.warn('maximum ratchet attempts exceeded');
					throw new CryptorError(
						`valid key missing for participant ${this.participantIdentity}`,
						CryptorErrorReason.InvalidKey,
						this.participantIdentity,
					);
				}
			} else {
				throw new CryptorError(
					`Decryption failed: ${getErrorMessage(error)}`,
					CryptorErrorReason.InvalidKey,
					this.participantIdentity,
				);
			}
		}
	}

	private makeIV(synchronizationSource: number, timestamp: number): ArrayBuffer {
		const iv = new ArrayBuffer(IV_LENGTH);
		const ivView = new DataView(iv);
		if (!this.sendCounts.has(synchronizationSource)) {
			this.sendCounts.set(synchronizationSource, Math.floor(Math.random() * 0xffff));
		}
		const sendCount = this.sendCounts.get(synchronizationSource) ?? 0;
		ivView.setUint32(0, synchronizationSource);
		ivView.setUint32(4, timestamp);
		ivView.setUint32(8, timestamp - (sendCount % 0xffff));
		this.sendCounts.set(synchronizationSource, sendCount + 1);
		return iv;
	}

	private static readonly FRAME_INFO_AUDIO = {
		unencryptedBytes: UNENCRYPTED_BYTES.audio,
		requiresNALUProcessing: false,
	} as const;
	private static readonly FRAME_INFO_VP8_KEY = {
		unencryptedBytes: UNENCRYPTED_BYTES.key,
		requiresNALUProcessing: false,
	} as const;
	private static readonly FRAME_INFO_VP8_DELTA = {
		unencryptedBytes: UNENCRYPTED_BYTES.delta,
		requiresNALUProcessing: false,
	} as const;
	private static readonly FRAME_INFO_ZERO = {unencryptedBytes: 0, requiresNALUProcessing: false} as const;

	private getUnencryptedBytes(frame: RTCEncodedVideoFrame | RTCEncodedAudioFrame): {
		readonly unencryptedBytes: number;
		readonly requiresNALUProcessing: boolean;
	} {
		if (!isVideoFrame(frame)) {
			return FrameCryptor.FRAME_INFO_AUDIO;
		}
		const detectedCodec = this.getVideoCodec(frame) ?? this.videoCodec;
		if (detectedCodec !== this.detectedCodec) {
			workerLogger.debug('detected different codec', {
				detectedCodec,
				oldCodec: this.detectedCodec,
				...this.logContext,
			});
			this.detectedCodec = detectedCodec;
		}
		if (detectedCodec === 'vp8') {
			return frame.type === 'key' ? FrameCryptor.FRAME_INFO_VP8_KEY : FrameCryptor.FRAME_INFO_VP8_DELTA;
		}
		if (detectedCodec === 'vp9' || detectedCodec === 'av1') {
			return FrameCryptor.FRAME_INFO_ZERO;
		}
		try {
			const knownCodec = detectedCodec === 'h264' || detectedCodec === 'h265' ? detectedCodec : undefined;
			const naluResult = processNALUsForEncryption(new Uint8Array(frame.data), knownCodec);
			if (naluResult.requiresNALUProcessing) {
				return {
					unencryptedBytes: naluResult.unencryptedBytes,
					requiresNALUProcessing: true,
				};
			}
		} catch (e) {
			workerLogger.debug('NALU processing failed, falling back to VP8 handling', {
				error: e,
				...this.logContext,
			});
		}
		return frame.type === 'key' ? FrameCryptor.FRAME_INFO_VP8_KEY : FrameCryptor.FRAME_INFO_VP8_DELTA;
	}

	private getVideoCodec(frame: RTCEncodedVideoFrame): VideoCodec | undefined {
		if (this.rtpMap.size === 0) {
			return undefined;
		}
		const payloadType = frame.getMetadata().payloadType;
		const codec = payloadType !== undefined ? this.rtpMap.get(payloadType) : undefined;
		return codec;
	}
}

export function isFrameServerInjected(frameData: ArrayBufferLike, trailerBytes: Uint8Array): boolean {
	const trailerLen = trailerBytes.byteLength;
	if (trailerLen === 0) {
		return false;
	}
	if (frameData.byteLength < trailerLen) {
		return false;
	}
	const frameTrailer = new Uint8Array(frameData, frameData.byteLength - trailerLen, trailerLen);
	for (let i = 0; i < trailerLen; i++) {
		if (trailerBytes[i] !== frameTrailer[i]) return false;
	}
	return true;
}
